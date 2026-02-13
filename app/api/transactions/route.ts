import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  const cookieStore = cookies();
  const currentUser = cookieStore.get('k10_user')?.value || 'tomo';
  
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('owner', currentUser)
    .order('date', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const cookieStore = cookies();
  const currentUser = cookieStore.get('k10_user')?.value || 'tomo';
  
  const body = await request.json();
  
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      ...body,
      owner: currentUser,
      source: 'manual',
      confirmed: true,
    })
    .select()
    .single();

  if (error) {
    console.error('Insert error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
