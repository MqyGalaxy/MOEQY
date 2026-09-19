import type { APIRoute } from 'astro';
import { routes } from '../lib/routes';
export const GET: APIRoute = () => new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/','/en/','/ja/',...routes.map(r=>`/${r.path}/`)].map(p=>`<url><loc>https://www.moeqy.com${p}</loc></url>`).join('')}</urlset>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
