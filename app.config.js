// app.json'daki ayarlara, web sürümü GitHub Pages'te alt klasörde (ör. /appstore) yayınlanırken
// gereken baseUrl eklenir. WEB_BASE_URL yalnız .github/workflows/pages.yml'deki derlemede verilir.
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.WEB_BASE_URL ? { baseUrl: process.env.WEB_BASE_URL } : {}),
  },
});
