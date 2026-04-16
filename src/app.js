const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const sanitize = require('./middleware/sanitize');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes/index');

const app = express();

// --------------- Security ---------------
app.use(helmet());

// --------------- CORS ---------------
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);

// --------------- Global API Rate Limit ---------------
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: {
    success: false,
    message: 'Too many requests. Please try again after a minute.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// --------------- Body Parsing ---------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// --------------- Input Sanitization ---------------
app.use(sanitize);

// --------------- Logging ---------------
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// --------------- Routes ---------------
app.use('/api', routes);

// --------------- 404 Handler ---------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// --------------- Global Error Handler ---------------
app.use(errorHandler);

module.exports = app;
