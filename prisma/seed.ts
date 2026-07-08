// Seed script for BlockExchange.buzz
// Run with: bun run db:seed
//
// Default accounts are embedded directly in this file (not env-dependent).
// This guarantees the same accounts are created on every fresh seed.

import { db } from "../src/lib/db";
import { hashPassword, generateUid } from "../src/lib/auth";

// ─── Default Accounts (embedded in code) ──────────────────────
const SUPER_ADMIN = {
  name: "Super Admin",
  email: "crdbixx@gmail.com",
  password: "123playbeat",
  uid: "BX-SUPERADMIN",
  referralCode: "SUPERADMIN",
};

const SUB_AGENTS = [
  { name: "SubAgent 1", email: "subagent1@trade.com", password: "default", code: "PB-AG001" },
  { name: "SubAgent 2", email: "subagent2@trade2.com", password: "default", code: "PB-AG002" },
  { name: "SubAgent 3", email: "subagent3@trade3.com", password: "default", code: "PB-AG003" },
  { name: "SubAgent 4", email: "subagent4@trade4.com", password: "default", code: "PB-AG004" },
  { name: "SubAgent 5", email: "subagent5@trade5.com", password: "default", code: "PB-AG005" },
];

async function seed() {
  console.log("🌱 Seeding BlockExchange.buzz database...\n");

  // ─── Super Admin ───────────────────────────────────────────
  const existingSuper = await db.user.findUnique({ where: { email: SUPER_ADMIN.email } });

  if (!existingSuper) {
    const passwordHash = await hashPassword(SUPER_ADMIN.password);
    const admin = await db.user.create({
      data: {
        uid: SUPER_ADMIN.uid,
        email: SUPER_ADMIN.email,
        passwordHash,
        name: SUPER_ADMIN.name,
        mobile: "+10000000000",
        country: "Global",
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        kycStatus: "VERIFIED",
        referralCode: SUPER_ADMIN.referralCode,
        mustChangePassword: false,
      },
    });

    await db.wallet.create({
      data: { userId: admin.id, available: 1000000 },
    });

    console.log(`✅ Super Admin created: ${SUPER_ADMIN.email}`);
  } else {
    console.log(`ℹ️  Super Admin already exists: ${SUPER_ADMIN.email}`);
  }

  // ─── Sub-Agent Accounts ────────────────────────────────────
  for (const sa of SUB_AGENTS) {
    const existing = await db.user.findUnique({ where: { email: sa.email } });
    if (existing) {
      console.log(`ℹ️  ${sa.name} already exists`);
      continue;
    }

    // Ensure invitation code is unique
    const codeOwner = await db.user.findUnique({ where: { referralCode: sa.code } });
    if (codeOwner) {
      console.log(`⚠️  Code ${sa.code} already in use — skipping ${sa.name}`);
      continue;
    }

    let uid = generateUid();
    while (await db.user.findUnique({ where: { uid } })) uid = generateUid();

    const passwordHash = await hashPassword(sa.password);
    const agent = await db.user.create({
      data: {
        uid,
        email: sa.email,
        passwordHash,
        name: sa.name,
        role: "AGENT",
        status: "ACTIVE",
        kycStatus: "VERIFIED",
        referralCode: sa.code,
        mustChangePassword: true, // must change default password on first login
      },
    });

    await db.agent.create({
      data: { userId: agent.id, commissionRate: 10 },
    });
    await db.wallet.create({
      data: { userId: agent.id, available: 0 },
    });

    console.log(`✅ ${sa.name} created · ${sa.email} · Code: ${sa.code}`);
  }

  // ─── System Notifications ──────────────────────────────────
  const existingNotifs = await db.systemNotification.count();
  if (existingNotifs === 0) {
    await db.systemNotification.createMany({
      data: [
        {
          title: "Welcome to BlockExchange.buzz",
          message: "Trade Smarter. Grow Faster. Your premium crypto trading platform is now live.",
          type: "info",
          audience: "all",
        },
        {
          title: "Trading Hours: 24/7",
          message: "BlockExchange.buzz operates 24 hours a day, 7 days a week. Trade anytime, anywhere.",
          type: "info",
          audience: "users",
        },
        {
          title: "Security Reminder",
          message: "Enable Two-Factor Authentication to secure your account and protect your funds.",
          type: "security",
          audience: "all",
        },
      ],
    });
    console.log("✅ System notifications created");
  }

  console.log("\n🎉 Seed complete!\n");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Default Accounts (embedded in code)");
  console.log("═══════════════════════════════════════════════════════");
  console.log("");
  console.log("  Super Admin:");
  console.log(`    Email:    ${SUPER_ADMIN.email}`);
  console.log(`    Password: ${SUPER_ADMIN.password}`);
  console.log(`    UID:      ${SUPER_ADMIN.uid}`);
  console.log("");
  console.log("  Sub-Agents (must change password on first login):");
  SUB_AGENTS.forEach((sa) => {
    console.log(`    ${sa.email.padEnd(28)} / ${sa.password.padEnd(8)} · Code: ${sa.code}`);
  });
  console.log("");
  console.log("  Customers register using one of the PB-AG00X codes above.");
  console.log("═══════════════════════════════════════════════════════\n");
}

seed()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
