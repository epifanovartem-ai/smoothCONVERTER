require('dotenv').config();
const path = require('path');
process.env.PUPPETEER_CACHE_DIR = path.join(__dirname, '.cache', 'puppeteer');

const express = require('express');
const multer = require('multer');
const { extractFromImage } = require('./lib/gemini');
const { renderPng } = require('./lib/render-png');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.static(path.join(__dirname, 'public')));

app.post('/convert', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });

    const danceType = req.body.danceType || 'slow-waltz';
    const pages = await extractFromImage(req.file.buffer, req.file.mimetype, danceType);
    const png = await renderPng(pages, danceType);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', 'attachment; filename="result.png"');
    res.send(png);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер: http://localhost:${PORT}`));
