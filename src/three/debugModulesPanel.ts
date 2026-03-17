import type { ModuleInfo } from './rendererModuleSystem'
import { isWebWorker } from './documentRenderer'

export class DebugModulesPanel {
  private overlay: HTMLDivElement | null = null
  private panel: HTMLDivElement | null = null
  private modulesList: HTMLDivElement | null = null
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private visible = false

  constructor (
    private readonly getModulesInfo: () => ModuleInfo[],
    private readonly setModuleForceState: (moduleId: string, forceState: boolean | null) => void
  ) {}

  show (): void {
    if (isWebWorker) return
    this.visible = true
    if (!this.overlay) {
      this.createDOM()
    }
    this.overlay!.style.display = 'flex'
    this.refreshModules()
    this.startPolling()
  }

  hide (): void {
    if (isWebWorker) return
    this.visible = false
    if (this.overlay) {
      this.overlay.style.display = 'none'
    }
    this.stopPolling()
  }

  toggle (): void {
    if (this.visible) {
      this.hide()
    } else {
      this.show()
    }
  }

  isVisible (): boolean {
    return this.visible
  }

  dispose (): void {
    this.stopPolling()
    if (this.overlay) {
      this.overlay.remove()
      this.overlay = null
      this.panel = null
      this.modulesList = null
    }
    this.visible = false
  }

  private startPolling (): void {
    this.stopPolling()
    this.pollInterval = setInterval(() => {
      this.refreshModules()
    }, 500)
  }

  private stopPolling (): void {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
  }

  private scheduleImmediateRefresh (): void {
    setTimeout(() => {
      this.refreshModules()
    }, 50)
  }

  private createDOM (): void {
    // Overlay backdrop
    const overlay = document.createElement('div')
    overlay.style.position = 'fixed'
    overlay.style.top = '0'
    overlay.style.left = '0'
    overlay.style.width = '100%'
    overlay.style.height = '100%'
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)'
    overlay.style.display = 'flex'
    overlay.style.alignItems = 'center'
    overlay.style.justifyContent = 'center'
    overlay.style.zIndex = '10000'
    overlay.addEventListener('click', () => {
      this.hide()
    })

    // Panel container
    const panel = document.createElement('div')
    panel.style.backgroundColor = 'rgba(0, 0, 0, 0.85)'
    panel.style.border = '2px solid rgba(255, 255, 255, 0.2)'
    panel.style.borderRadius = '4px'
    panel.style.padding = '6px'
    panel.style.maxWidth = 'min(308px, 85vw)'
    panel.style.maxHeight = '70vh'
    panel.style.overflowY = 'auto'
    panel.style.color = 'white'
    panel.style.fontFamily = 'monospace'
    panel.style.fontSize = '11px'
    panel.addEventListener('click', (e) => {
      e.stopPropagation()
    })

    // Header
    const header = document.createElement('div')
    header.style.display = 'flex'
    header.style.justifyContent = 'space-between'
    header.style.alignItems = 'center'
    header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.2)'
    header.style.marginBottom = '6px'
    header.style.paddingBottom = '4px'

    const title = document.createElement('div')
    title.style.fontSize = '13px'
    title.style.fontWeight = 'bold'
    title.innerText = 'Modules Debug'

    const closeBtn = document.createElement('button')
    closeBtn.innerText = '✕'
    closeBtn.style.background = 'none'
    closeBtn.style.border = 'none'
    closeBtn.style.color = '#aaa'
    closeBtn.style.fontFamily = 'monospace'
    closeBtn.style.fontSize = '14px'
    closeBtn.style.cursor = 'pointer'
    closeBtn.style.minWidth = '28px'
    closeBtn.style.minHeight = '28px'
    closeBtn.style.display = 'flex'
    closeBtn.style.alignItems = 'center'
    closeBtn.style.justifyContent = 'center'
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.color = '#fff'
    })
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.color = '#aaa'
    })
    closeBtn.addEventListener('click', () => {
      this.hide()
    })

    header.appendChild(title)
    header.appendChild(closeBtn)

    // Modules list container
    const modulesList = document.createElement('div')
    modulesList.style.display = 'flex'
    modulesList.style.flexDirection = 'column'
    modulesList.style.gap = '4px'

    panel.appendChild(header)
    panel.appendChild(modulesList)
    overlay.appendChild(panel)
    document.body.appendChild(overlay)

    this.overlay = overlay
    this.panel = panel
    this.modulesList = modulesList
  }

  private refreshModules (): void {
    if (!this.modulesList) return
    const modules = this.getModulesInfo()

    // Clear existing
    this.modulesList.innerHTML = ''

    if (modules.length === 0) {
      const empty = document.createElement('div')
      empty.style.color = '#666'
      empty.style.textAlign = 'center'
      empty.style.padding = '10px'
      empty.innerText = 'No modules registered'
      this.modulesList.appendChild(empty)
      return
    }

    for (const mod of modules) {
      this.modulesList.appendChild(this.createModuleRow(mod))
    }
  }

  private createModuleRow (mod: ModuleInfo): HTMLDivElement {
    const row = document.createElement('div')
    row.style.display = 'flex'
    row.style.justifyContent = 'space-between'
    row.style.alignItems = 'center'
    row.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
    row.style.padding = '4px 6px'
    row.style.borderRadius = '3px'
    row.style.gap = '6px'
    row.style.flexWrap = 'wrap'

    const name = document.createElement('span')
    name.style.fontWeight = 'bold'
    name.style.color = '#ddd'
    name.innerText = mod.id

    const switchGroup = document.createElement('div')
    switchGroup.style.display = 'flex'
    switchGroup.style.gap = '2px'
    switchGroup.style.backgroundColor = 'rgba(0, 0, 0, 0.3)'
    switchGroup.style.borderRadius = '3px'
    switchGroup.style.padding = '2px'

    const autoLabel = mod.enabled ? 'AUTO (on)' : 'AUTO (off)'

    const autoBtn = this.createSwitchButton(autoLabel, mod.configState === 'auto', false, {
      activeBg: 'rgba(100, 149, 237, 0.5)',
      activeBorder: 'rgba(100, 149, 237, 0.8)'
    }, () => {
      this.setModuleForceState(mod.id, null)
      this.scheduleImmediateRefresh()
    })
    autoBtn.style.width = '80px'
    autoBtn.style.textAlign = 'center'

    const onBtn = this.createSwitchButton('ON', mod.configState === 'enabled', false, {
      activeBg: 'rgba(76, 175, 80, 0.5)',
      activeBorder: 'rgba(76, 175, 80, 0.8)'
    }, () => {
      this.setModuleForceState(mod.id, true)
      this.scheduleImmediateRefresh()
    })

    const offDisabled = mod.cannotBeDisabled === true
    const offBtn = this.createSwitchButton('OFF', mod.configState === 'disabled', offDisabled, {
      activeBg: 'rgba(244, 67, 54, 0.5)',
      activeBorder: 'rgba(244, 67, 54, 0.8)'
    }, () => {
      this.setModuleForceState(mod.id, false)
      this.scheduleImmediateRefresh()
    })

    switchGroup.appendChild(autoBtn)
    switchGroup.appendChild(offBtn)
    switchGroup.appendChild(onBtn)

    row.appendChild(name)
    row.appendChild(switchGroup)
    return row
  }

  private createSwitchButton (
    label: string,
    active: boolean,
    disabled: boolean,
    colors: { activeBg: string; activeBorder: string },
    onClick: () => void
  ): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.innerText = label
    btn.style.padding = '3px 6px'
    btn.style.minWidth = '28px'
    btn.style.minHeight = '28px'
    btn.style.border = '1px solid rgba(255, 255, 255, 0.1)'
    btn.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
    btn.style.color = '#999'
    btn.style.fontFamily = 'monospace'
    btn.style.fontSize = '10px'
    btn.style.borderRadius = '2px'
    btn.style.cursor = 'pointer'
    btn.style.whiteSpace = 'nowrap'
    btn.style.transition = 'all 0.15s'

    if (active) {
      btn.style.color = '#fff'
      btn.style.fontWeight = 'bold'
      btn.style.backgroundColor = colors.activeBg
      btn.style.borderColor = colors.activeBorder
    }

    if (disabled) {
      btn.style.opacity = '0.3'
      btn.style.cursor = 'not-allowed'
    } else {
      btn.addEventListener('mouseenter', () => {
        if (!active) {
          btn.style.backgroundColor = 'rgba(255, 255, 255, 0.15)'
          btn.style.color = '#fff'
        }
      })
      btn.addEventListener('mouseleave', () => {
        if (!active) {
          btn.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
          btn.style.color = '#999'
        }
      })
      btn.addEventListener('click', onClick)
    }

    return btn
  }
}
