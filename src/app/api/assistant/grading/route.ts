import { NextResponse } from 'next/server';

// 助教角色已从系统中移除，该接口保留占位并明确返回 404
export async function GET() {
  return NextResponse.json({ error: '助教功能已移除' }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ error: '助教功能已移除' }, { status: 404 });
}
