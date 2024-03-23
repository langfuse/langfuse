import app from "./app";

const port = process.env.PORT ? parseInt(process.env.PORT) : 3030;
app.listen(port, () => {
  console.log(`Listening: http://localhost:${port}`);
});
