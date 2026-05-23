const keys = Object.keys(process.env).filter(k => 
  k.toUpperCase().includes("POLAR") || 
  k.toUpperCase().includes("TOKEN") || 
  k.toUpperCase().includes("ACCESS") ||
  k.toUpperCase().includes("SECRET") ||
  k.toUpperCase().includes("KEY")
);
console.log("Environment keys:");
for (const k of keys) {
  const val = process.env[k];
  console.log(`- ${k}: len=${val ? val.length : 0}, prefix=${val ? val.substring(0, 15) : 'N/A'}`);
}
