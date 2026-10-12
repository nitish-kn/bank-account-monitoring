@echo off

set PM2_HOME=C:\Users\Administrator\.pm2
set PM2_PATH=C:\nvm4w\nodejs\pm2.cmd

echo [%date% %time%] Starting PM2... >> D:\Services\tally-bridge\pm2-startup.log

"%PM2_PATH%" resurrect >> D:\Services\tally-bridge\pm2-startup.log 2>&1

echo [%date% %time%] PM2 resurrect completed. >> D:\Services\tally-bridge\pm2-startup.log