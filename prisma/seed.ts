import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database…");

  // --- Lead sources ---
  const sources = [
    { name: "website", label: "Website Form", routingStrategy: "ROUND_ROBIN" as const, priority: 0 },
    { name: "landing-page", label: "Landing Page", routingStrategy: "PRIORITY" as const, priority: 5 },
    { name: "facebook-ads", label: "Facebook Ads", routingStrategy: "ROUND_ROBIN" as const, priority: 3 },
    { name: "google-ads", label: "Google Ads", routingStrategy: "SKILL_BASED" as const, requiredSkill: "sales", priority: 4 },
  ];
  for (const s of sources) {
    await prisma.leadSource.upsert({
      where: { name: s.name },
      update: { label: s.label, routingStrategy: s.routingStrategy, priority: s.priority, requiredSkill: s.requiredSkill ?? null },
      create: s,
    });
  }

  // --- Agents ---
  const agents = [
    { name: "Alex Morgan", phone: "+15551230001", email: "alex@example.com", priority: 10, skills: "sales,support", status: "AVAILABLE" as const },
    { name: "Brianna Lee", phone: "+15551230002", email: "brianna@example.com", priority: 8, skills: "sales", status: "AVAILABLE" as const },
    { name: "Carlos Diaz", phone: "+15551230003", email: "carlos@example.com", priority: 5, skills: "support", status: "AVAILABLE" as const },
    { name: "Dana White", phone: "+15551230004", email: "dana@example.com", priority: 7, skills: "sales,billing", status: "AVAILABLE" as const },
    { name: "Evan Patel", phone: "+15551230005", email: "evan@example.com", priority: 3, skills: "support,billing", status: "OFFLINE" as const },
  ];
  for (const a of agents) {
    const existing = await prisma.agent.findFirst({ where: { phone: a.phone } });
    if (existing) {
      await prisma.agent.update({ where: { id: existing.id }, data: a });
    } else {
      await prisma.agent.create({ data: a });
    }
  }

  // --- Routing rules ---
  // Wildcard fallback rule (applies to all sources) plus a source-specific one.
  const existingWildcard = await prisma.routingRule.findFirst({ where: { name: "Default round-robin" } });
  if (!existingWildcard) {
    await prisma.routingRule.create({
      data: {
        name: "Default round-robin",
        enabled: true,
        order: 100,
        sourceName: null,
        strategy: "ROUND_ROBIN",
        maxAttempts: 3,
      },
    });
  }
  const existingGoogle = await prisma.routingRule.findFirst({ where: { name: "Google Ads → skilled sales" } });
  if (!existingGoogle) {
    await prisma.routingRule.create({
      data: {
        name: "Google Ads → skilled sales",
        enabled: true,
        order: 10,
        sourceName: "google-ads",
        strategy: "SKILL_BASED",
        requiredSkill: "sales",
        maxAttempts: 3,
      },
    });
  }

  // --- Business hours ---
  // Seeded as effectively always-open (00:00–23:59, all 7 days) so the
  // happy-flow demo works the moment you install. 23:59 (not 24:00) so the
  // value round-trips cleanly through the time picker. Tighten these in
  // Settings → Business Hours to exercise the "outside hours" routing branch.
  for (let day = 0; day <= 6; day++) {
    await prisma.businessHours.upsert({
      where: { dayOfWeek: day },
      update: {},
      create: {
        dayOfWeek: day,
        openMinute: 0,
        closeMinute: 1439,
        enabled: true,
        timezone: "UTC",
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
