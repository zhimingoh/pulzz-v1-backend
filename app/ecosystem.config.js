module.exports = {
  apps: [
    {
      name: "pulzz-hotupdate",
      cwd: "/opt/pulzz-hotupdate/app",
      script: "src/server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "20808"
      }
    }
  ]
};
