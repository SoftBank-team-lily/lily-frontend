export const vertexShader = `
attribute vec3 aStart; attribute vec3 aSpread; attribute float aExtra; attribute float aRand; attribute float aBright; attribute vec3 aColor;
uniform vec3 uUnlitColor, uWiltColor;
uniform float uTime, uAssemble, uProgress, uWilt, uSize, uPR, uGather;
varying vec3 vColor; varying float vAlpha;
void main(){
  float t = clamp((uAssemble - aRand*0.4)/0.6, 0.0, 1.0);
  t = 1.0 - pow(1.0 - t, 3.0);
  // 배포 진행률에 따라 퍼진 자리(aSpread)에서 제자리(position)로 모임. 끝부분에서 가장 많이 모이도록 곡선을 줌
  float g = clamp((pow(uGather, 1.4) * 1.3) - aRand * 0.3, 0.0, 1.0);
  g = g * g * (3.0 - 2.0 * g);
  vec3 home = mix(aSpread, position, g);
  // 시듦: 바깥쪽일수록 아래로 처지고 안쪽으로 오그라듦
  float dw = length(position.xy) / 1.75;
  float w = uWilt * (0.85 + 0.3*aRand);
  home.xy *= 1.0 - w * 0.16 * dw;
  home.y  -= w * (0.9 * dw * dw + 0.06);
  home.z  -= w * 0.4 * dw;
  vec3 p = mix(aStart, home, t);
  // 일부 입자는 꽃잎 가루처럼 천천히 떨어짐
  float fall = step(0.84, aRand) * uWilt;
  float ft = fract(uTime * 0.07 + aRand * 7.0);
  p.y -= fall * ft * ft * 2.4;
  p.x += fall * sin(uTime * 0.8 + aRand * 50.0) * 0.1 * ft;
  float calm = 1.0 - 0.75 * g;
  p.x += sin(uTime*0.6 + aRand*40.0)*0.022*calm;
  p.y += cos(uTime*0.5 + aRand*33.0)*0.022*calm;
  p.z += sin(uTime*0.4 + aRand*21.0)*0.035*calm;
  vec4 mv = modelViewMatrix * vec4(p,1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPR * (0.55 + aBright*0.7) * (1.0 + 0.12*g) / -mv.z;
  float d = length(position.xy) / 1.75;
  float edge = uProgress * 1.3;
  float reveal = 1.0 - smoothstep(edge - 0.22, edge, d + (aRand - 0.5)*0.18);
  vec3 gray = uUnlitColor * (0.3 + aBright*0.8);
  vec3 col  = aColor * (0.4 + aBright*0.85);
  vec3 c = mix(gray, col, reveal);
  vec3 dry = uWiltColor * (0.22 + aBright*0.55);
  c = mix(c, dry, uWilt * 0.85);
  vColor = c;
  float tw = 0.62 + 0.38*sin(uTime*(1.2 + aRand*3.0) + aRand*60.0);
  vAlpha = (0.1 + aBright*0.55) * tw * mix(0.3, 1.0, t) * mix(0.75, 1.1, g) * mix(1.0, g*g, aExtra) * (1.0 - 0.4*uWilt) * (1.0 - fall*ft);
}`;

export const fragmentShader = `
uniform float uOpacity; varying vec3 vColor; varying float vAlpha;
void main(){
  float r = length(gl_PointCoord - 0.5);
  if (r > 0.5) discard;
  float a = smoothstep(0.5, 0.0, r);
  gl_FragColor = vec4(vColor, a * vAlpha * uOpacity);
}`;
