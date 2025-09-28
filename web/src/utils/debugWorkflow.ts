/**
 * Debugging utility for AutoSweep -> PromptExperiment -> Regression Runs workflow
 * Run this in browser console to inspect the current state
 */

declare global {
  interface Window {
    debugBarcableWorkflow: () => void;
  }
}

function debugBarcableWorkflow() {
  // Only run in browser environment
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    console.log("❌ Debug utility only available in browser environment");
    return;
  }
  
  console.log("🔍 Debugging Barcable AutoSweep -> PromptExperiment -> Regression Runs workflow");
  
  try {
    // Check localStorage experiments
    const stored = localStorage.getItem("promptExperiments");
    if (!stored) {
      console.log("❌ No experiments found in localStorage");
      return;
    }

    const experiments = JSON.parse(stored);
    console.log(`✅ Found ${experiments.length} experiments in localStorage`);
    
    experiments.forEach((exp: any, index: number) => {
      console.log(`\n📊 Experiment ${index + 1}:`);
      console.log(`  Name: "${exp.name}"`);
      console.log(`  Original Prompt Name: "${exp.originalPromptName || 'NOT SET'}"`);
      console.log(`  Status: ${exp.status}`);
      console.log(`  Prompts: ${exp.prompts?.length || 0}`);
      console.log(`  Created: ${exp.createdAt}`);
      
      // Check if this experiment would work with regression runs
      const basePromptName = exp.originalPromptName || exp.name.replace(/ Experiment$/, '');
      const hasOriginalPromptName = !!exp.originalPromptName;
      
      console.log(`  🔍 Regression Run Compatibility:`);
      console.log(`    Would search for prompts named: "${basePromptName}"`);
      console.log(`    Has originalPromptName field: ${hasOriginalPromptName ? '✅' : '❌'}`);
      
      if (!hasOriginalPromptName && exp.name.endsWith(' Experiment')) {
        console.log(`    ⚠️  This experiment needs migration to work with regression runs`);
      }
    });
    
    console.log(`\n🔧 Migration Status:`);
    const migratedCount = experiments.filter((exp: any) => exp.originalPromptName).length;
    console.log(`  Migrated experiments: ${migratedCount}/${experiments.length}`);
    
    if (migratedCount < experiments.length) {
      console.log(`  ⚠️  ${experiments.length - migratedCount} experiments need migration`);
      console.log(`  💡 Refresh the experiments page to trigger automatic migration`);
    } else {
      console.log(`  ✅ All experiments are migration-ready`);
    }
    
  } catch (error) {
    console.error("❌ Error debugging workflow:", error);
  }
}

// Make it available globally (only in browser environment)
if (typeof window !== 'undefined') {
  window.debugBarcableWorkflow = debugBarcableWorkflow;
}

export { debugBarcableWorkflow };