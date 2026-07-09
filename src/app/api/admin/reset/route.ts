import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, hashPassword, generateUid } from "@/lib/auth";
import { db } from "@/lib/db";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// POST /api/admin/reset — Super Admin only
// Drops all data and re-seeds with default accounts only (no dummy entries).
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Super Admin access required" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const confirm = body.confirm;

    if (confirm !== "RESET_ALL_DATA") {
      return NextResponse.json(
        { error: "Confirmation required. Send { confirm: 'RESET_ALL_DATA' } to proceed." },
        { status: 400 }
      );
    }

    // ─── Drop and recreate the public schema ─────────────────
    await db.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await db.$executeRawUnsafe('CREATE SCHEMA public');
    try { await db.$executeRawUnsafe('GRANT ALL ON SCHEMA public TO postgres'); } catch {}
    await db.$executeRawUnsafe('GRANT ALL ON SCHEMA public TO public');

    // Disconnect the current Prisma client
    await db.$disconnect();

    // ─── Push the schema using prisma CLI ─────────────────────
    // This is the most reliable way to recreate all tables with correct types
    const { stdout, stderr } = await execAsync(
      'cd /home/z/my-project && DATABASE_URL="' + process.env.DATABASE_URL + '" bunx prisma db push --accept-data-loss 2>&1',
      { timeout: 60000 }
    );

    // ─── Reconnect and seed ───────────────────────────────────
    const { PrismaClient } = await import("@prisma/client");
    const freshDb = new PrismaClient();

    // Super Admin
    const superAdminEmail = "crdbixx@gmail.com";
    const superAdminPassword = "123playbeat";
    const passwordHash = await hashPassword(superAdminPassword);
    const admin = await freshDb.user.create({
      data: {
        uid: "BX-SUPERADMIN",
        email: superAdminEmail,
        passwordHash,
        name: "Super Admin",
        mobile: "+10000000000",
        country: "Global",
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        kycStatus: "VERIFIED",
        referralCode: "SUPERADMIN",
        mustChangePassword: false,
      },
    });
    await freshDb.wallet.create({
      data: { userId: admin.id, available: 1000000 },
    });

    // 5 Sub-Agents
    const subAgents = [
      { name: "SubAgent 1", email: "subagent1@trade.com", code: "PB-AG001" },
      { name: "SubAgent 2", email: "subagent2@trade2.com", code: "PB-AG002" },
      { name: "SubAgent 3", email: "subagent3@trade3.com", code: "PB-AG003" },
      { name: "SubAgent 4", email: "subagent4@trade4.com", code: "PB-AG004" },
      { name: "SubAgent 5", email: "subagent5@trade5.com", code: "PB-AG005" },
    ];
    const agentHash = await hashPassword("default");
    for (const sa of subAgents) {
      let uid = generateUid();
      while (await freshDb.user.findUnique({ where: { uid } })) uid = generateUid();
      const agent = await freshDb.user.create({
        data: {
          uid,
          email: sa.email,
          passwordHash: agentHash,
          name: sa.name,
          role: "AGENT",
          status: "ACTIVE",
          kycStatus: "VERIFIED",
          referralCode: sa.code,
          mustChangePassword: true,
        },
      });
      await freshDb.agent.create({ data: { userId: agent.id, commissionRate: 10 } });
      await freshDb.wallet.create({ data: { userId: agent.id, available: 0 } });
    }

    // System notifications
    await freshDb.systemNotification.createMany({
      data: [
        { title: "Welcome to BlockExchange.buzz", message: "Trade Smarter. Grow Faster. Your premium crypto trading platform is now live.", type: "info", audience: "all" },
        { title: "Trading Hours: 24/7", message: "BlockExchange.buzz operates 24 hours a day, 7 days a week.", type: "info", audience: "users" },
        { title: "Security Reminder", message: "Enable Two-Factor Authentication to secure your account.", type: "security", audience: "all" },
      ],
    });

    await freshDb.$disconnect();

    return NextResponse.json({
      success: true,
      message: "Platform reset to zero. Only default accounts remain (1 Super Admin + 5 Sub-Agents). No dummy entries.",
      seeded: {
        superAdmin: superAdminEmail,
        subAgents: subAgents.length,
        systemNotifications: 3,
      },
    });
  } catch (e: any) {
    console.error("Reset error:", e);
    return NextResponse.json({ error: e.message || "Reset failed" }, { status: 500 });
  }
}
