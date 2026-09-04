import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Usuario admin por defecto
  const adminEmail = 'admin@modulos.com';
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    const password = await bcrypt.hash('admin123', 10);
    await prisma.user.create({
      data: {
        email: adminEmail,
        password,
        name: 'Administrador',
        role: UserRole.ADMIN,
      },
    });
    console.log(`Usuario admin creado -> email: ${adminEmail} / password: admin123`);
  }

  // Configuración inicial (CBU de ejemplo, editable desde el dashboard)
  await prisma.settings.upsert({
    where: { id: 'main' },
    update: {},
    create: {
      id: 'main',
      bankCbu: '0000003100000000000000',
      bankAlias: 'MODULOS.CELULARES',
      bankHolder: 'Nombre del Titular',
      ticketHours: 24,
    },
  });

  // Productos de ejemplo
  const count = await prisma.product.count();
  if (count === 0) {
    await prisma.product.createMany({
      data: [
        {
          sku: 'MOD-SAM-S21-001',
          name: 'Módulo Pantalla Samsung Galaxy S21',
          brand: 'Samsung',
          model: 'Galaxy S21',
          description: 'Módulo original con pantalla AMOLED y marco.',
          characteristics: { calidad: 'Original', tipo: 'AMOLED', color: 'Negro' },
          price: 85000,
          stock: 10,
          minStock: 3,
          maxStock: 30,
        },
        {
          sku: 'MOD-IPH-13-001',
          name: 'Módulo Pantalla iPhone 13',
          brand: 'Apple',
          model: 'iPhone 13',
          description: 'Módulo compatible OLED alta calidad.',
          characteristics: { calidad: 'OEM', tipo: 'OLED', color: 'Negro' },
          price: 95000,
          stock: 2,
          minStock: 4,
          maxStock: 25,
        },
      ],
    });
    console.log('Productos de ejemplo creados.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
