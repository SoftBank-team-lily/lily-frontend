// 서버가 시작할 때 한 번 실행된다. BUILDER_URL 이 있으면 등록된 프로젝트를 lily-builder 로 배포하는 실행기를 켠다.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.BUILDER_URL)
    return;
  const { startBuilderWorker } = await import("./lib/builder/worker");
  startBuilderWorker();
}
