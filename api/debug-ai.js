export default async function handler(req, res) {
  res.status(200).json({ hasKey: Boolean(process.env.OPENAI_API_KEY) });
}
