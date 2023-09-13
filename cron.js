var CronJob = require("cron").CronJob;
var os = require("os");

if (
  process.env.TELEMETRY_ENABLED === undefined ||
  process.env.TELEMETRY_ENABLED === "true"
) {
  try {
    // get internal ip address
    var networkInterfaces = os.networkInterfaces();
    var ip = undefined;

    if ("eth0" in networkInterfaces) {
      var ipaddresses = networkInterfaces["eth0"]
        .filter((networkInterface) => networkInterface.family === "IPv4")
        .map((networkInterface) => networkInterface.address);
      if (ipaddresses.length > 0) {
        ip = ipaddresses[0];
      }
    }

    if (ip) {
      var job = new CronJob("*/5 * * * *", function () {
        fetch(`http://${ip}:3000/api/cron/telemetry`).catch((err) =>
          console.log(err),
        );
      });

      job.start();
    } else {
      console.log("CRON: No ip address found, not starting cron job");
    }
  } catch (err) {
    console.log("CRON: Error", err);
  }
} else {
  console.log("CRON: Telemetry disabled via env");
}
