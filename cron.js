var CronJob = require("cron").CronJob;
var os = require("os");

try {
  // get internal ip address
  var networkInterfaces = os.networkInterfaces();
  console.log("CRON: fetched network interfaces", networkInterfaces);
  var ip = undefined;

  if ("eth0" in networkInterfaces) {
    var ipaddresses = networkInterfaces["eth0"]
      .filter((networkInterface) => networkInterface.family === "IPv4")
      .map((networkInterface) => networkInterface.address);
    if (ipaddresses.length > 0) {
      ip = ipaddresses[0];
    }
  }
  console.log("CRON: IP", ip);

  if (ip) {
    var job = new CronJob("*/5 * * * *", function () {
      console.log("CRON: Sending telemetry");
      fetch(`http://${ip}:3000/api/cron/telemetry`).catch((err) =>
        console.log(err),
      );
    });

    if (
      process.env.TELEMETRY_ENABLED === undefined ||
      process.env.TELEMETRY_ENABLED === "true"
    )
      job.start();
  } else {
    console.log("CRON: No ip address found, not starting cron job");
  }
} catch (err) {
  console.log("CRON: Error", err);
}