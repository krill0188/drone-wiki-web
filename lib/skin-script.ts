// 첫 그림 전에 밤 모드 클래스를 붙여 깜빡임을 막는 인라인 스크립트(서버 컴포넌트 layout의 <head>에서 쓴다). lib/skin.ts의 키와 같아야 한다.
export const PRE_PAINT = `try{var t=localStorage.getItem("dw-theme")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark")}catch(e){}`
