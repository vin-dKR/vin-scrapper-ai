import express, { type Request, type Response } from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post('/ask', async (req: Request, res: Response) => {
  console.log("this is ask route")
  const { question, context } = req.body;
  if (!question || !context) {
    return res.status(400).json({ error: 'Missing question or website srapped context' });
  }
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: 'You are Vin Scrapper AI, an assistant that answers questions about the following web page content.' },
        { role: 'user', content: `Context: ${context}\n\nQuestion: ${question}` },
      ],
      max_tokens: 256,
    });
    const answer = completion.choices[0]?.message?.content || '';
    res.json({ answer });
  } catch (err: any) {
    res.status(500).json({ error: 'AI request failed', details: err.message });
  }
});

app.listen(3000, () => {
  console.log('Bun backend listening on http://localhost:3000');
});