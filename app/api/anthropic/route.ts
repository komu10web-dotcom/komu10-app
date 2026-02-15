import { NextRequest, NextResponse } from 'next/server';

// GETハンドラ（動作確認用）
export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    message: 'Anthropic API route is working',
    hasApiKey: !!process.env.ANTHROPIC_API_KEY 
  });
}

// POSTハンドラ（実際のAPI呼び出し）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: errorText }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'API request failed', details: String(error) }, { status: 500 });
  }
}
