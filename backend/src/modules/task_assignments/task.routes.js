const express = require('express');
const router = express.Router();
const multer = require('multer');
const taskController = require('./task.controller');

const upload = multer({ dest: 'uploads/' });
router.post('/upload-excel', upload.single('file'), (req, res, next) => {
  console.log('Reached upload middleware');
  // console.log('req.file:', req.file);
  next();
}, taskController.uploadExcel);
// router.post('/upload-excel', upload.single('file'), taskController.uploadExcel);

module.exports = router;
