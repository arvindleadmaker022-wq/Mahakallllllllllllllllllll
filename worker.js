import 'dotenv/config';
import nodemailer from 'nodemailer';

const SITE_PASSWORD = 'changeme';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (path === '/api/auth' && request.method === 'POST') {
        const body = await request.json();
        if (body.password === (env.SITE_PASSWORD || SITE_PASSWORD)) {
          return new Response(JSON.stringify({ success: true, message: "Access granted" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ success: false, message: "Incorrect password" }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (path === '/api/verify' && request.method === 'POST') {
        const { email, appPassword } = await request.json();
        if (!email || !appPassword) {
          return new Response(JSON.stringify({ success: false, message: "Credentials required" }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: { user: email.trim(), pass: appPassword.replace(/\s+/g, '') }
        });

        await transporter.verify();
        return new Response(JSON.stringify({ success: true, message: "SMTP verified successfully" }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, message: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
