const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // --- Admin User ---
  const hashedPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@dimagpharmacy.com' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@dimagpharmacy.com',
      phone: '9876543210',
      password: hashedPassword,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });
  console.log('Admin user seeded');

  // --- Default Categories ---
  const categories = [
    'Tablets',
    'Capsules',
    'Syrups',
    'Injections',
    'Ointments',
    'Drops',
    'Inhalers',
    'Supplements',
  ];

  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log('Categories seeded');

  // --- Default Shop Settings ---
  const existingSettings = await prisma.shopSettings.findFirst();
  if (!existingSettings) {
    await prisma.shopSettings.create({
      data: {
        name: 'Dimag Pharmacy',
        address: '123 Medical Lane',
        city: 'Agra',
        state: 'Uttar Pradesh',
        pincode: '282001',
        phone: '9876543210',
        email: 'info@dimagpharmacy.com',
        printHeader: 'Dimag Pharmacy — Your Health Partner',
        printFooter: 'Thank you for your purchase! Get well soon.',
        taxRate: 0,
      },
    });
  }
  console.log('Shop settings seeded');

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
