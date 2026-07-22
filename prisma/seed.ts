import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Upsert seeded users
  const users = [
    { name: "Alice Author", email: "alice@example.com", role: Role.AUTHOR },
    { name: "Bob Reviewer", email: "bob@example.com", role: Role.REVIEWER },
    { name: "Carol Reviewer", email: "carol@example.com", role: Role.REVIEWER },
    { name: "Aman Admin", email: "admin@example.com", role: Role.ADMIN },
    { name: "Vikram Viewer", email: "viewer@example.com", role: Role.VIEWER },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role },
      create: user,
    });
    console.log(`  ✓ ${user.role}: ${user.name} (${user.email})`);
  }

  console.log("✅ Seed complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
