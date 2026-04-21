/**
 * PM2 process file — run: pm2 start ecosystem.config.cjs
 * @see https://pm2.keymetrics.io/docs/usage/application-declaration/
 */
module.exports = {
  apps: [
    {
      name: 'wa-labudda',
      script: 'app.js',
      cwd: __dirname,
      instances: 1,
      // Fork mode: Baileys sockets live in-memory (one process per machine for this design).
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 50,
      min_uptime: '10s',
      max_memory_restart: '512M',
      kill_timeout: 10_000,
      wait_ready: false,
      listen_timeout: 0,
      env: {
        NODE_ENV: 'production',
      },
      // Load variables from .env in project root (requires pm2 >= 5)
      env_file: '.env',
    },
  ],
};
