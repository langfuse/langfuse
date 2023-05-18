export const ogImgUrl = (
  title: string,
  subtitle?: string,
  hideFirstLine = false,
) => {
  const hostname = process.env.NEXT_PUBLIC_VERCEL_URL
    ? "https://" + process.env.NEXT_PUBLIC_VERCEL_URL
    : "localhost:3000";
  const path = "/api/og";
  let query = `?title=${encodeURIComponent(title)}`;
  if (subtitle) query += `&subtitle=${encodeURIComponent(subtitle)}`;
  if (hideFirstLine) query += "&hideFirstLine=true";

  return hostname + path + query;
};
