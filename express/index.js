const express = require('express');

const app = express();

app.get('/api', (req, res) => res.json('hhhhh'));

app.listen(3000, () => console.log('3000'));
