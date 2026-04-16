require('dotenv').config();

const app = require('./src/app');

// Export for Vercel serverless
module.exports = app;

// Local development only
if (require.main === module) {
  const prisma = require('./src/config/db');
  const PORT = process.env.PORT || 8000;

  const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.error(`Missing required environment variable: ${envVar}`);
      process.exit(1);
    }
  }

  const startServer = async () => {
    try {
      await prisma.$connect();
      console.log('Database connected successfully');

      app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`API available at http://localhost:${PORT}/api`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      });
    } catch (err) {
      console.error('Failed to start server:', err.message);
      process.exit(1);
    }
  };

  process.on('SIGINT', async () => {
    await prisma.$disconnect();
    console.log('\nServer shut down gracefully');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await prisma.$disconnect();
    process.exit(0);
  });

  startServer();
}
