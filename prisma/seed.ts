import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import crypto from 'crypto';

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

/** Generate a simple unique ID */
function genId(): string {
  return crypto.randomBytes(12).toString('hex');
}

/** Legal text building blocks */
const subjects = [
  'The Contractor',
  'The Client',
  'The Service Provider',
  'The Licensee',
  'The Company',
  'Each Party',
  'The Employer',
  'The Consultant',
  'The Vendor',
  'The Purchaser',
  'The Lessor',
  'The Lessee',
  'The Guarantor',
  'The Indemnitor',
  'The Assignee',
];

const verbs = [
  'shall provide',
  'agrees to deliver',
  'shall not disclose',
  'warrants that',
  'represents and warrants',
  'covenants to',
  'shall indemnify',
  'must comply with',
  'shall be responsible for',
  'agrees to maintain',
  'shall promptly notify',
  'undertakes to',
  'shall use commercially reasonable efforts to',
  'hereby grants',
  'shall exercise due diligence in',
];

const objects = [
  'all necessary documentation and materials',
  'the confidential information described herein',
  'the services outlined in Exhibit A',
  'reasonable notice prior to termination',
  'all applicable federal and state regulations',
  'insurance coverage as specified in Section 4.2',
  'written consent from all relevant parties',
  'a detailed report of findings and recommendations',
  'any intellectual property developed during the engagement',
  'the agreed-upon deliverables within the specified timeframe',
  'compliance with all environmental standards',
  'records of all transactions and communications',
  'access to all relevant facilities and personnel',
  'a comprehensive audit of financial statements',
  'timely payment of all outstanding obligations',
];

const conditions = [
  'subject to the terms and conditions set forth in this Agreement',
  'in accordance with the schedule described in Appendix B',
  'provided that such obligations shall survive termination',
  'unless otherwise agreed upon in writing by both parties',
  'notwithstanding any contrary provisions herein',
  'to the fullest extent permitted by applicable law',
  'within thirty (30) calendar days of receipt of notice',
  'upon the occurrence of any Event of Default',
  'during the term of this Agreement and for two (2) years thereafter',
  'in a manner consistent with industry best practices',
  'except as expressly provided in Section 7.1',
  'contingent upon the satisfactory completion of due diligence',
  'following the effective date of this Amendment',
  'in compliance with all relevant data protection regulations',
  'prior to the execution of any binding commitment',
];

const sectionTitles = [
  'ARTICLE I: DEFINITIONS AND INTERPRETATION',
  'ARTICLE II: SCOPE OF SERVICES',
  'ARTICLE III: COMPENSATION AND PAYMENT',
  'ARTICLE IV: TERM AND TERMINATION',
  'ARTICLE V: CONFIDENTIALITY',
  'ARTICLE VI: INTELLECTUAL PROPERTY',
  'ARTICLE VII: REPRESENTATIONS AND WARRANTIES',
  'ARTICLE VIII: INDEMNIFICATION',
  'ARTICLE IX: LIMITATION OF LIABILITY',
  'ARTICLE X: DISPUTE RESOLUTION',
  'ARTICLE XI: GOVERNING LAW',
  'ARTICLE XII: FORCE MAJEURE',
  'ARTICLE XIII: ASSIGNMENT',
  'ARTICLE XIV: NOTICES',
  'ARTICLE XV: MISCELLANEOUS PROVISIONS',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateSentence(): string {
  return `${pick(subjects)} ${pick(verbs)} ${pick(objects)} ${pick(conditions)}. `;
}

function generateParagraph(sentenceCount: number): string {
  let para = '';
  for (let i = 0; i < sentenceCount; i++) {
    para += generateSentence();
  }
  return para;
}

function generateDocument(
  sectionCount: number,
  paragraphsPerSection: number,
  sentencesPerParagraph: number
): string {
  let doc = '';
  for (let s = 0; s < sectionCount; s++) {
    doc += sectionTitles[s % sectionTitles.length] + '\n\n';
    for (let p = 0; p < paragraphsPerSection; p++) {
      doc +=
        `${s + 1}.${p + 1} ` +
        generateParagraph(sentencesPerParagraph) +
        '\n\n';
    }
  }
  return doc;
}

/** Convert a raw string into CharNode data with pre-generated IDs and linked list refs */
function textToNodes(
  text: string,
  documentId: string
): {
  id: string;
  content: string;
  afterId: string | null;
  documentId: string;
  deleted: boolean;
}[] {
  // Split into words preserving whitespace
  const words: string[] = [];
  const regex = /(\S+\s*)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    words.push(match[1]);
  }

  const nodes = [];
  let prevId: string | null = null;

  for (const word of words) {
    const id = genId();
    nodes.push({
      id,
      content: word,
      afterId: prevId,
      documentId,
      deleted: false,
    });
    prevId = id;
  }

  return nodes;
}

/** Batch insert nodes in chunks to avoid SQLite variable limits */
async function batchInsertNodes(nodes: any[], batchSize = 100) {
  for (let i = 0; i < nodes.length; i += batchSize) {
    const batch = nodes.slice(i, i + batchSize);
    await prisma.charNode.createMany({ data: batch });
  }
}

async function main() {
  console.log('Seeding database...');
  console.time('Total seed time');

  // Create users
  const alice = await prisma.user.create({ data: { name: 'Alice' } });
  const bob = await prisma.user.create({ data: { name: 'Bob' } });
  const charlie = await prisma.user.create({ data: { name: 'Charlie' } });
  console.log('Created 3 users');

  // ──────────────────────────────────────────────────────
  // Document 1: Small — Simple NDA (~200 words)
  // ──────────────────────────────────────────────────────
  console.time('Doc 1: Small NDA');
  const doc1 = await prisma.document.create({
    data: { title: 'Non-Disclosure Agreement', userId: alice.id },
  });
  const doc1Text = generateDocument(3, 2, 3);
  const doc1Nodes = textToNodes(doc1Text, doc1.id);
  await batchInsertNodes(doc1Nodes);
  console.timeEnd('Doc 1: Small NDA');
  console.log(`  ${doc1Nodes.length} nodes`);

  // ──────────────────────────────────────────────────────
  // Document 2: Small — Employment Agreement (~300 words)
  // ──────────────────────────────────────────────────────
  console.time('Doc 2: Employment Agreement');
  const doc2 = await prisma.document.create({
    data: { title: 'Employment Agreement', userId: bob.id },
  });
  const doc2Text = generateDocument(4, 2, 4);
  const doc2Nodes = textToNodes(doc2Text, doc2.id);
  await batchInsertNodes(doc2Nodes);
  console.timeEnd('Doc 2: Employment Agreement');
  console.log(`  ${doc2Nodes.length} nodes`);

  // ──────────────────────────────────────────────────────
  // Document 3: Medium — Service Agreement (~2,000 words)
  // ──────────────────────────────────────────────────────
  console.time('Doc 3: Medium Service Agreement');
  const doc3 = await prisma.document.create({
    data: { title: 'Master Service Agreement', userId: alice.id },
  });
  const doc3Text = generateDocument(10, 4, 5);
  const doc3Nodes = textToNodes(doc3Text, doc3.id);
  await batchInsertNodes(doc3Nodes);
  console.timeEnd('Doc 3: Medium Service Agreement');
  console.log(`  ${doc3Nodes.length} nodes`);

  // ──────────────────────────────────────────────────────
  // Document 4: Medium — Licensing Agreement (~3,000 words)
  // ──────────────────────────────────────────────────────
  console.time('Doc 4: Medium Licensing Agreement');
  const doc4 = await prisma.document.create({
    data: { title: 'Software Licensing Agreement', userId: charlie.id },
  });
  const doc4Text = generateDocument(12, 5, 5);
  const doc4Nodes = textToNodes(doc4Text, doc4.id);
  await batchInsertNodes(doc4Nodes);
  console.timeEnd('Doc 4: Medium Licensing Agreement');
  console.log(`  ${doc4Nodes.length} nodes`);

  // ──────────────────────────────────────────────────────
  // Document 5: Large — Corporate Merger Agreement (~20,000 words)
  // ──────────────────────────────────────────────────────
  console.time('Doc 5: Large Merger Agreement');
  const doc5 = await prisma.document.create({
    data: { title: 'Corporate Merger Agreement', userId: bob.id },
  });
  const doc5Text = generateDocument(15, 15, 8);
  const doc5Nodes = textToNodes(doc5Text, doc5.id);
  await batchInsertNodes(doc5Nodes);
  console.timeEnd('Doc 5: Large Merger Agreement');
  console.log(`  ${doc5Nodes.length} nodes`);

  // ──────────────────────────────────────────────────────
  // Document 6: Large — Partnership Agreement (~25,000 words)
  // ──────────────────────────────────────────────────────
  console.time('Doc 6: Large Partnership Agreement');
  const doc6 = await prisma.document.create({
    data: { title: 'General Partnership Agreement', userId: alice.id },
  });
  const doc6Text = generateDocument(15, 18, 9);
  const doc6Nodes = textToNodes(doc6Text, doc6.id);
  await batchInsertNodes(doc6Nodes);
  console.timeEnd('Doc 6: Large Partnership Agreement');
  console.log(`  ${doc6Nodes.length} nodes`);

  // ──────────────────────────────────────────────────────
  // Document 7: Huge — Regulatory Compliance Manual (~100,000 words)
  // ──────────────────────────────────────────────────────
  console.time('Doc 7: Huge Compliance Manual');
  const doc7 = await prisma.document.create({
    data: { title: 'Regulatory Compliance Manual', userId: charlie.id },
  });
  const doc7Text = generateDocument(15, 60, 10);
  const doc7Nodes = textToNodes(doc7Text, doc7.id);
  await batchInsertNodes(doc7Nodes, 200);
  console.timeEnd('Doc 7: Huge Compliance Manual');
  console.log(`  ${doc7Nodes.length} nodes`);

  // ──────────────────────────────────────────────────────
  // Document 8: Small with pending changes
  // ──────────────────────────────────────────────────────
  console.time('Doc 8: Small with pending changes');
  const doc8 = await prisma.document.create({
    data: { title: 'Consulting Agreement (Under Review)', userId: bob.id },
  });
  const doc8Text = generateDocument(3, 2, 3);
  const doc8Nodes = textToNodes(doc8Text, doc8.id);
  await batchInsertNodes(doc8Nodes);

  // Add pending changes
  await prisma.change.create({
    data: {
      type: 'replace',
      status: 'pending',
      deleteIds: JSON.stringify([doc8Nodes[2].id]),
      afterId: doc8Nodes[1].id,
      newText: 'must deliver ',
      originalText: doc8Nodes[2].content,
      documentId: doc8.id,
      userId: alice.id,
    },
  });
  await prisma.change.create({
    data: {
      type: 'delete',
      status: 'pending',
      deleteIds: JSON.stringify([doc8Nodes[5].id, doc8Nodes[6].id]),
      afterId: null,
      newText: null,
      originalText: doc8Nodes[5].content + doc8Nodes[6].content,
      documentId: doc8.id,
      userId: charlie.id,
    },
  });
  console.timeEnd('Doc 8: Small with pending changes');
  console.log(`  ${doc8Nodes.length} nodes, 2 pending changes`);

  // ──────────────────────────────────────────────────────
  // Document 9: Medium with pending changes
  // ──────────────────────────────────────────────────────
  console.time('Doc 9: Medium with pending changes');
  const doc9 = await prisma.document.create({
    data: {
      title: 'Real Estate Purchase Agreement (Under Review)',
      userId: alice.id,
    },
  });
  const doc9Text = generateDocument(8, 4, 5);
  const doc9Nodes = textToNodes(doc9Text, doc9.id);
  await batchInsertNodes(doc9Nodes);

  // Add several pending changes from different users
  const pendingSpots = [10, 50, 120, 200, 350];
  for (let i = 0; i < pendingSpots.length; i++) {
    const idx = Math.min(pendingSpots[i], doc9Nodes.length - 2);
    const user = i % 2 === 0 ? bob : charlie;
    const types = ['replace', 'delete', 'replace', 'replace', 'delete'];

    await prisma.change.create({
      data: {
        type: types[i],
        status: 'pending',
        deleteIds: JSON.stringify([doc9Nodes[idx].id]),
        afterId: idx > 0 ? doc9Nodes[idx - 1].id : null,
        newText: types[i] === 'delete' ? null : 'AMENDED TERM ',
        originalText: doc9Nodes[idx].content,
        documentId: doc9.id,
        userId: user.id,
      },
    });
  }
  console.timeEnd('Doc 9: Medium with pending changes');
  console.log(
    `  ${doc9Nodes.length} nodes, ${pendingSpots.length} pending changes`
  );

  // ──────────────────────────────────────────────────────
  // Document 10: Medium with mixed change statuses
  // ──────────────────────────────────────────────────────
  console.time('Doc 10: Mixed statuses');
  const doc10 = await prisma.document.create({
    data: {
      title: 'Joint Venture Agreement (Partially Reviewed)',
      userId: charlie.id,
    },
  });
  const doc10Text = generateDocument(6, 3, 4);
  const doc10Nodes = textToNodes(doc10Text, doc10.id);
  await batchInsertNodes(doc10Nodes);

  const statuses = [
    'accepted',
    'rejected',
    'pending',
    'pending',
    'accepted',
    'rejected',
    'pending',
  ];
  const spots10 = [5, 15, 30, 60, 90, 120, 150];
  for (let i = 0; i < spots10.length; i++) {
    const idx = Math.min(spots10[i], doc10Nodes.length - 2);
    await prisma.change.create({
      data: {
        type: 'replace',
        status: statuses[i],
        deleteIds: JSON.stringify([doc10Nodes[idx].id]),
        afterId: idx > 0 ? doc10Nodes[idx - 1].id : null,
        newText: 'REVISED CLAUSE ',
        originalText: doc10Nodes[idx].content,
        documentId: doc10.id,
        userId: i % 3 === 0 ? alice.id : i % 3 === 1 ? bob.id : charlie.id,
      },
    });
  }
  console.timeEnd('Doc 10: Mixed statuses');
  console.log(
    `  ${doc10Nodes.length} nodes, ${spots10.length} changes (mixed statuses)`
  );

  // ──────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────
  const totalNodes = [
    doc1Nodes,
    doc2Nodes,
    doc3Nodes,
    doc4Nodes,
    doc5Nodes,
    doc6Nodes,
    doc7Nodes,
    doc8Nodes,
    doc9Nodes,
    doc10Nodes,
  ].reduce((sum, nodes) => sum + nodes.length, 0);

  console.log('\n=== Seed Summary ===');
  console.log(`Users: 3`);
  console.log(`Documents: 10`);
  console.log(`Total CharNodes: ${totalNodes}`);
  console.log(`Documents with pending changes: 3`);
  console.timeEnd('Total seed time');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
