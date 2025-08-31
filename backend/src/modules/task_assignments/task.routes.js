const express = require('express');
const router = express.Router();
const multer = require('multer');
const {authenticateToken,authorizeRoles} = require('../../middlewares/auth');
const taskController = require('./task.controller');

const upload = multer({ dest: 'uploads/' });
router.post('/upload-excel', upload.single('file'), (req, res, next) => {
  console.log('Reached upload task sheet middleware');
  // console.log('req.file:', req.file);
  next();
}, taskController.uploadExcel);
// router.post('/upload-excel', upload.single('file'), taskController.uploadExcel);

router.get("/getUnassignedTasks", authenticateToken, authorizeRoles("Admin"), taskController.getUnassignedTasks);
router.get("/getAvailableDrivers", authenticateToken, authorizeRoles("Admin"), taskController.getAvailableDrivers);
  

module.exports = router;
