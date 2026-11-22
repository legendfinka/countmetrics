import { PrismaClient } from "@prisma/client";
import { seedDemo } from "../src/demo/seed-demo.js";

const prisma = new PrismaClient();

try {
  const { events, minutes } = await seedDemo(prisma);
  console.log(`Demo data is ready: ${events} events and ${minutes} minute rows.`);
} finally {
  await prisma.$disconnect();
}
