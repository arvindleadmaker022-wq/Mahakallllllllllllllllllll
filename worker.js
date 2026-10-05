import 'dotenv/config';

console.log('👷 Background Worker process active and ready.');

process.on('message', (msg) => {
  if (msg && msg.action === 'ping') {
    process.send({ status: 'alive' });
  }
});
