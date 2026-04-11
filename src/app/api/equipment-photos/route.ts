import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const equipmentId = formData.get('equipment_id') as string | null;

    if (!file || !equipmentId) {
      return NextResponse.json({ success: false, error: '画像とequipment_idが必要です' }, { status: 400 });
    }

    // Service role client for storage operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check current photo count
    const { data: item } = await supabase
      .from('equipment_items')
      .select('photos')
      .eq('id', equipmentId)
      .single();

    if (!item) {
      return NextResponse.json({ success: false, error: '備品が見つかりません' }, { status: 404 });
    }

    const currentPhotos: string[] = item.photos || [];
    if (currentPhotos.length >= 5) {
      return NextResponse.json({ success: false, error: '写真は最大5枚までです' }, { status: 400 });
    }

    // Upload to storage
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${equipmentId}/${Date.now()}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('equipment-photos')
      .upload(fileName, buffer, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ success: false, error: 'アップロード失敗: ' + uploadError.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('equipment-photos')
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    // Update equipment_items photos array
    const updatedPhotos = [...currentPhotos, publicUrl];
    const { error: updateError } = await supabase
      .from('equipment_items')
      .update({ photos: updatedPhotos })
      .eq('id', equipmentId);

    if (updateError) {
      return NextResponse.json({ success: false, error: 'DB更新失敗: ' + updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, url: publicUrl, photos: updatedPhotos });
  } catch (error) {
    console.error('Equipment photo upload error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { equipmentId, photoUrl } = await request.json();

    if (!equipmentId || !photoUrl) {
      return NextResponse.json({ success: false, error: 'equipment_idとphotoUrlが必要です' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current photos
    const { data: item } = await supabase
      .from('equipment_items')
      .select('photos')
      .eq('id', equipmentId)
      .single();

    if (!item) {
      return NextResponse.json({ success: false, error: '備品が見つかりません' }, { status: 404 });
    }

    // Remove from array
    const updatedPhotos = (item.photos || []).filter((p: string) => p !== photoUrl);

    // Delete from storage
    const pathMatch = photoUrl.match(/equipment-photos\/(.+)$/);
    if (pathMatch) {
      await supabase.storage.from('equipment-photos').remove([pathMatch[1]]);
    }

    // Update DB
    await supabase
      .from('equipment_items')
      .update({ photos: updatedPhotos })
      .eq('id', equipmentId);

    return NextResponse.json({ success: true, photos: updatedPhotos });
  } catch (error) {
    console.error('Equipment photo delete error:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
