module.exports = {
  apps: [
    {
      name: "acala-extract",
      script: "pnpm",
      args: "start extract",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      out_file: "./logs/extract.log",
      error_file: "./logs/extract-error.log",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "acala-transform",
      script: "pnpm",
      args: "start transform",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      out_file: "./logs/transform.log",
      error_file: "./logs/transform-error.log",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};