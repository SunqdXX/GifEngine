#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

P='st(0,140+36*sin(2*PI*T/1.5));st(1,if(between(mod(T,3),1.35,1.5),0.15,1));st(2,ld(0)-10);st(3,lt(hypot(X-104,(Y-ld(2))/ld(1)),9)+lt(hypot(X-152,(Y-ld(2))/ld(1)),9));st(4,70*clip(1-hypot(X-100,Y-ld(0)+30)/40,0,1));'
R="${P}if(ld(3),30,clip(139+116*X/W+ld(4),0,255))"
G="${P}if(ld(3),20,clip(108-13*X/W+ld(4),0,255))"
B="${P}if(ld(3),50,clip(255-87*X/W+ld(4),0,255))"
A='st(0,140+36*sin(2*PI*T/1.5));255*clip((70-hypot(X-128,Y-ld(0)))/2+0.5,0,1)'

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "color=c=black@0:s=256x256:r=20:d=3,format=rgba" \
  -vf "geq=r='${R}':g='${G}':b='${B}':a='${A}'" \
  -c:v libwebp_anim -lossless 0 -quality 82 -loop 0 \
  media/samples/gifengine-blob.webp
echo "wrote media/samples/gifengine-blob.webp ($(du -h media/samples/gifengine-blob.webp | cut -f1))"
