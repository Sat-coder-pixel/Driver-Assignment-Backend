const express = require('express');
const app = express();


app.use(express.json());
const authRoutes= require('./modules/auth/auth.routes');
const taskRoutes = require('./modules/task_assignments/task.routes');

//All API routes for authentication
app.use('/api/auth', authRoutes);

// All API routes for task uploads
app.use('/api/tasks', taskRoutes);

app.get('/', (req, res) => {
  res.send('Welcome to the Task Assignment API');   
});
module.exports = app;
