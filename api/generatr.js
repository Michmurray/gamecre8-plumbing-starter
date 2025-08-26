// api/generatr.js

export default function handler(req, res) {
  if (req.method === "POST") {
    try {
      const { prompt } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: "Missing prompt" });
      }

      // Stub: Replace this with your actual game generation logic
      const game = {
        id: Date.now(),
        prompt,
        message: `Game generated for prompt: "${prompt}"`,
      };

      return res.status(200).json(game);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  } else {
    res.setHeader("Allow", ["POST"]);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
