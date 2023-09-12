var CronJob = require("cron").CronJob;

const os = require('os');
const networkInterfaces = os.networkInterfaces();
console.log(networkInterfaces);

// var job = new CronJob(
//   "*/5 * * * * *", // Every 5 minutes
//   function () {
//     fetch("http://host.docker.internal:3000/api/cron/telemetry").catch((err) =>
//       console.log(err),
//     );
//   },
// );

// if (
//   process.env.TELEMETRY_ENABLED === undefined ||
//   process.env.TELEMETRY_ENABLED === "true"
// )
//   job.start();
