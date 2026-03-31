module.exports = {
  apps: [
    {
      name: 'memescout-backend',
      cwd: '/opt/memescout',
      script: 'npx',
      args: 'tsx backend/server.ts',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '700M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
