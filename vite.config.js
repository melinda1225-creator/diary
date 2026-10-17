import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 배포(빌드) 결과물에만 콘텐츠 보안 정책(CSP)을 넣습니다.
// - 이 사이트는 자기 자신의 스크립트만 실행하고, 통신은 api.github.com으로만 허용합니다.
//   (토큰이 다른 곳으로 새어 나가는 것을 브라우저 차원에서 막아줘요.)
// - 개발 모드(npm run dev)에서는 Vite가 인라인 스크립트를 쓰므로 적용하지 않습니다.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "font-src https://cdn.jsdelivr.net",
  "img-src 'self' data: blob:",
  "connect-src https://api.github.com",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ')

function cspPlugin() {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
      )
    },
  }
}

// GitHub Pages 프로젝트 사이트(https://<아이디>.github.io/<레포이름>/)로 배포한다면
// base를 반드시 '/레포이름/' 형태로 바꿔주세요.
// 예: 레포 이름이 'our-diary'라면 base: '/our-diary/'
// (User/Organization Pages, 즉 <아이디>.github.io 레포라면 base: '/' 유지)
export default defineConfig({
  plugins: [react(), cspPlugin()],
  base: '/our-diary/',
})
