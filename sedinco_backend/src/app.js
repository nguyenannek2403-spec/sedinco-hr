const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const apiRoutes = require('./routes/index');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');

const app = express();

// Middlewares toàn cục
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Healthcheck endpoints (cho Render Web Service & Uptime Monitors)
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        name: 'Sedinco HR Backend API',
        time: new Date().toISOString()
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

// Gắn toàn bộ REST API routes
app.use('/api', apiRoutes);

// Xử lý 404 và Error Handler
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
