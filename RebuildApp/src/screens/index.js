import { renderHomeScreen } from './home.js'
import { renderGameSelectionScreen } from './gameSelection.js'
import { renderFactionSelectionScreen } from './factionSelection.js'
import { renderPackageSelectionScreen } from './packageSelection.js'
import { renderThemeSelectionScreen } from './themeSelection.js'
/**
 * Single roster renderer — certification command center (`rosterViewer.js`).
 * Do not add alternate roster imports; Android/Web share this switch only.
 */
import { renderRosterViewerScreen } from './rosterViewer.js'
import { renderOperatorPackageScreen } from './operatorPackage.js'
import { renderOperatorFactionScreen } from './operatorFaction.js'
import { renderRosterImportScreen } from './rosterImport.js'
import { renderOperatorOverviewScreen } from './operatorOverview.js'
import { renderOperatorValidationScreen } from './operatorValidation.js'
import { renderNfcAssignmentScreen } from './nfcAssignment.js'
import { renderNfcTestRuntimeScreen } from './nfcTest.js'
import { renderRuntimeScreen } from './runtime.js'
import { renderInteractionTestScreen } from './interactionTest.js'

export function renderScreen(state, context = {}) {
  return getScreenContent(state, context)
}

function getScreenContent(state, context) {
  switch (state.currentScreen) {
    case 'operator-package':
      return renderOperatorPackageScreen()
    case 'operator-faction':
      return renderOperatorFactionScreen(state)
    case 'roster-import':
      return renderRosterImportScreen(state)
    case 'operator-overview':
      return renderOperatorOverviewScreen(state)
    case 'operator-validation':
      return renderOperatorValidationScreen(state)
    case 'home':
      return renderHomeScreen(state)
    case 'game-selection':
      return renderGameSelectionScreen(state)
    case 'faction-selection':
      return renderFactionSelectionScreen(state)
    case 'package-selection':
      return renderPackageSelectionScreen(state)
    case 'theme-selection':
      return renderThemeSelectionScreen(state)
    case 'roster-viewer':
      return renderRosterViewerScreen(state)
    case 'nfc-assignment':
      return renderNfcAssignmentScreen(state, context.nfcRuntime)
    case 'nfc-test':
      return renderNfcTestRuntimeScreen(context.nfcRuntime)
    case 'runtime':
      return renderRuntimeScreen(state)
    case 'interaction-test':
      return renderInteractionTestScreen()
    default:
      return '<h2>Unknown screen</h2>'
  }
}
