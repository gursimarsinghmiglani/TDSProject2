// middleware.js
import { NextResponse } from 'next/server'

export function middleware(request) {
    const url = request.nextUrl

    // Redirect /api/ → /api
    if (url.pathname === '/api/') {
        url.pathname = '/api'
        return NextResponse.redirect(url)
    }

    return NextResponse.next()
}
export const config = {
    matcher: ['/api/']
}