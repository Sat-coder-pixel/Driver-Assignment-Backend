const app = require('./app'); // <-- Use app.js here
const { startListening } = require('./automation/taskautomation');

app.listen(3000, () => {
  console.log('Server is running on port 3000');
  // Start email automation in-process
  try {
    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      startListening();
      console.log('Automation started');
    } else {
      console.log('GMAIL credentials not set; automation not started');
    }
  } catch (e) {
    console.error('Failed to start automation:', e);
  }
});