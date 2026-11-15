@echo off
title NetWorth Tracker - Mobile Access Tunnel
echo ================================================================
echo   NetWorth Tracker - Mobile Access Tunnel
echo   Forwarding local port 3001 to Cloudflare Edge
echo ================================================================
echo.
echo Connecting to Cloudflare...
echo Look for the https://*.trycloudflare.com URL below!
echo Copy that URL into your phone's 'Configure Server URL' field.
echo.
"%~dp0cloudflared.exe" tunnel --url http://127.0.0.1:3001
pause
