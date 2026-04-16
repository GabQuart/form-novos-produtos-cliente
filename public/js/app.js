/* global window, document, fetch, URL, Auth */
(function () {
  'use strict'

  const MAX_IMAGES = 8
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024

  const views = {
    loading: document.getElementById('loading-view'),
    login: document.getElementById('login-view'),
    form: document.getElementById('form-view'),
    success: document.getElementById('success-view'),
  }

  const loginForm = document.getElementById('login-form')
  const loginError = document.getElementById('login-error')
  const logoutBtn = document.getElementById('logout-btn')
  const sessionEmail = document.getElementById('session-email')

  const productForm = document.getElementById('product-form')
  const sizesGroups = document.getElementById('sizes-groups')
  const sizeChartWrapper = document.getElementById('size-chart-wrapper')
  const sizeChartList = document.getElementById('size-chart-list')
  const colorsList = document.getElementById('colors-list')
  const variationColors = document.getElementById('variation-colors')
  const variationText = document.getElementById('variation-text')
  const variationTextHint = document.getElementById('variation-text-hint')
  const textVariationsList = document.getElementById('text-variations-list')
  const addVariationBtn = document.getElementById('add-variation-btn')
  const imagesInput = document.getElementById('images-input')
  const imagesPreview = document.getElementById('images-preview')
  const submitError = document.getElementById('submit-error')

  const successId = document.getElementById('success-id')
  const successFolder = document.getElementById('success-folder')
  const newRequestBtn = document.getElementById('new-request-btn')

  const state = {
    options: null, // { sizeGroups, colors }
    selectedSizes: new Set(),
    measurements: new Map(), // size -> string[] (tracked via DOM; this is just helper)
    selectedColors: new Set(),
    textVariations: [''],
    images: [], // { file, url }
    formDataLoaded: false,
  }

  function setView(name) {
    for (const key of Object.keys(views)) {
      views[key].classList.toggle('hidden', key !== name)
    }
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild)
  }

  function showButtonLoading(button, loading) {
    if (!button) return
    if (loading) {
      if (!button.dataset.originalText) {
        button.dataset.originalText = button.textContent
      }
      button.disabled = true
      const loadingText = button.dataset.loadingText || 'Enviando...'
      button.textContent = loadingText
    } else {
      button.disabled = false
      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText
        delete button.dataset.originalText
      }
    }
  }

  // ---------- Login ----------

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    loginError.textContent = ''
    const formData = new FormData(loginForm)
    const email = String(formData.get('email') || '').trim()
    const password = String(formData.get('password') || '')
    if (!email || !password) {
      loginError.textContent = 'Informe e-mail e senha.'
      return
    }
    const button = loginForm.querySelector('button[type="submit"]')
    showButtonLoading(button, true)
    try {
      await Auth.signIn(email, password)
    } catch (err) {
      loginError.textContent = err.message || 'Falha no login.'
    } finally {
      showButtonLoading(button, false)
    }
  })

  logoutBtn.addEventListener('click', async () => {
    await Auth.signOut()
  })

  // ---------- Form data ----------

  async function ensureFormDataLoaded() {
    if (state.formDataLoaded) return
    const res = await fetch('/api/form-data')
    const payload = await res.json()
    if (!payload || !payload.ok || !payload.data) {
      throw new Error((payload && payload.error) || 'Falha ao carregar dados do formulario')
    }
    state.options = payload.data
    renderSizeGroups()
    renderColors()
    state.formDataLoaded = true
  }

  function renderSizeGroups() {
    clearNode(sizesGroups)
    for (const group of state.options.sizeGroups || []) {
      const wrapper = document.createElement('div')
      wrapper.className = 'size-group'

      const label = document.createElement('p')
      label.className = 'size-group-label'
      label.textContent = group.label
      wrapper.appendChild(label)

      const chips = document.createElement('div')
      chips.className = 'chips'

      for (const item of group.items) {
        const chip = document.createElement('label')
        chip.className = 'chip'
        const input = document.createElement('input')
        input.type = 'checkbox'
        input.value = item.code
        input.dataset.label = item.label
        input.addEventListener('change', onSizeToggle)
        const span = document.createElement('span')
        span.textContent = item.label
        chip.appendChild(input)
        chip.appendChild(span)
        chips.appendChild(chip)
      }

      wrapper.appendChild(chips)
      sizesGroups.appendChild(wrapper)
    }
  }

  function renderColors() {
    clearNode(colorsList)
    for (const color of state.options.colors || []) {
      const chip = document.createElement('label')
      chip.className = 'chip'
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.value = color
      input.addEventListener('change', onColorToggle)
      const span = document.createElement('span')
      span.textContent = color
      chip.appendChild(input)
      chip.appendChild(span)
      colorsList.appendChild(chip)
    }
  }

  // ---------- Sizes + measurements ----------

  function onSizeToggle(event) {
    const input = event.currentTarget
    const size = input.value
    const label = input.dataset.label || size
    const chip = input.closest('.chip')
    if (input.checked) {
      state.selectedSizes.add(size)
      chip.classList.add('is-active')
      addMeasureCard(size, label)
    } else {
      state.selectedSizes.delete(size)
      chip.classList.remove('is-active')
      removeMeasureCard(size)
    }
    sizeChartWrapper.hidden = state.selectedSizes.size === 0
  }

  function addMeasureCard(size, label) {
    if (sizeChartList.querySelector(`[data-size="${cssEscape(size)}"]`)) return
    const card = document.createElement('div')
    card.className = 'measure-card'
    card.dataset.size = size

    const title = document.createElement('h4')
    title.textContent = `Medidas para ${label}`
    card.appendChild(title)

    const inputs = document.createElement('div')
    inputs.className = 'measure-inputs'
    card.appendChild(inputs)

    const addBtn = document.createElement('button')
    addBtn.type = 'button'
    addBtn.className = 'btn small'
    addBtn.textContent = '+ adicionar medida'
    addBtn.addEventListener('click', () => {
      appendMeasureInput(inputs, '')
    })
    card.appendChild(addBtn)

    appendMeasureInput(inputs, '')
    sizeChartList.appendChild(card)
  }

  function appendMeasureInput(container, value) {
    const row = document.createElement('div')
    row.className = 'measure-input-row'
    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = 'Ex.: Busto 50 cm'
    input.maxLength = 120
    input.value = value
    const removeBtn = document.createElement('button')
    removeBtn.type = 'button'
    removeBtn.className = 'btn small'
    removeBtn.textContent = 'x'
    removeBtn.addEventListener('click', () => {
      if (container.children.length > 1) {
        container.removeChild(row)
      } else {
        input.value = ''
      }
    })
    row.appendChild(input)
    row.appendChild(removeBtn)
    container.appendChild(row)
  }

  function removeMeasureCard(size) {
    const card = sizeChartList.querySelector(`[data-size="${cssEscape(size)}"]`)
    if (card) card.remove()
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value)
    }
    return String(value).replace(/"/g, '\\"')
  }

  // ---------- Variations ----------

  productForm.addEventListener('change', (event) => {
    const target = event.target
    if (target && target.name === 'variationType') {
      onVariationTypeChange(target.value)
    }
  })

  function onVariationTypeChange(type) {
    if (type === 'cores') {
      variationColors.hidden = false
      variationText.hidden = true
    } else if (type === 'estampas' || type === 'variados') {
      variationColors.hidden = true
      variationText.hidden = false
      variationTextHint.textContent =
        type === 'estampas'
          ? 'Liste as estampas (uma por linha).'
          : 'Liste as variacoes (uma por linha).'
      renderTextVariations()
    } else {
      variationColors.hidden = true
      variationText.hidden = true
    }
  }

  function onColorToggle(event) {
    const input = event.currentTarget
    const chip = input.closest('.chip')
    if (input.checked) {
      state.selectedColors.add(input.value)
      chip.classList.add('is-active')
    } else {
      state.selectedColors.delete(input.value)
      chip.classList.remove('is-active')
    }
  }

  addVariationBtn.addEventListener('click', () => {
    state.textVariations.push('')
    renderTextVariations()
  })

  function renderTextVariations() {
    clearNode(textVariationsList)
    if (state.textVariations.length === 0) state.textVariations = ['']

    state.textVariations.forEach((value, idx) => {
      const row = document.createElement('div')
      row.className = 'text-variation-row'
      const input = document.createElement('input')
      input.type = 'text'
      input.maxLength = 120
      input.placeholder = `Variacao ${idx + 1}`
      input.value = value
      input.addEventListener('input', (e) => {
        state.textVariations[idx] = e.target.value
      })
      const removeBtn = document.createElement('button')
      removeBtn.type = 'button'
      removeBtn.className = 'btn small'
      removeBtn.textContent = 'x'
      removeBtn.addEventListener('click', () => {
        state.textVariations.splice(idx, 1)
        renderTextVariations()
      })
      row.appendChild(input)
      row.appendChild(removeBtn)
      textVariationsList.appendChild(row)
    })
  }

  // ---------- Images ----------

  imagesInput.addEventListener('change', (event) => {
    const files = Array.from(event.target.files || [])
    addImages(files)
    imagesInput.value = ''
  })

  function addImages(files) {
    for (const file of files) {
      if (state.images.length >= MAX_IMAGES) {
        submitError.textContent = `Maximo de ${MAX_IMAGES} imagens.`
        break
      }
      if (!file.type || !file.type.startsWith('image/')) continue
      if (file.size > MAX_IMAGE_BYTES) {
        submitError.textContent = `"${file.name}" excede 8 MB.`
        continue
      }
      const url = URL.createObjectURL(file)
      state.images.push({ file, url })
    }
    renderImagesPreview()
  }

  function renderImagesPreview() {
    clearNode(imagesPreview)
    state.images.forEach((entry, idx) => {
      const wrapper = document.createElement('div')
      wrapper.className = 'preview-item'
      const img = document.createElement('img')
      img.src = entry.url
      img.alt = entry.file.name
      const removeBtn = document.createElement('button')
      removeBtn.type = 'button'
      removeBtn.setAttribute('aria-label', 'Remover')
      removeBtn.textContent = 'x'
      removeBtn.addEventListener('click', () => {
        URL.revokeObjectURL(entry.url)
        state.images.splice(idx, 1)
        renderImagesPreview()
      })
      wrapper.appendChild(img)
      wrapper.appendChild(removeBtn)
      imagesPreview.appendChild(wrapper)
    })
  }

  // ---------- Submit ----------

  productForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    submitError.textContent = ''

    const button = productForm.querySelector('button[type="submit"]')
    try {
      validateForm()
    } catch (err) {
      submitError.textContent = err.message
      return
    }

    const session = Auth.getSession()
    if (!session) {
      submitError.textContent = 'Sua sessao expirou. Faca login novamente.'
      return
    }

    showButtonLoading(button, true)
    try {
      const fd = buildSubmitFormData()
      const res = await fetch('/api/submit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload || !payload.ok) {
        throw new Error((payload && payload.error) || `Falha ao enviar (HTTP ${res.status}).`)
      }
      onSubmitSuccess(payload.data)
    } catch (err) {
      submitError.textContent = err.message || 'Falha ao enviar solicitacao.'
    } finally {
      showButtonLoading(button, false)
    }
  })

  function collectMeasurements() {
    const entries = []
    const cards = sizeChartList.querySelectorAll('.measure-card')
    cards.forEach((card) => {
      const size = card.dataset.size
      card.querySelectorAll('.measure-input-row input').forEach((input) => {
        const measurement = input.value.trim()
        if (measurement) entries.push({ size, measurement })
      })
    })
    return entries
  }

  function collectVariations() {
    const type = (new FormData(productForm).get('variationType') || '').toString()
    if (type === 'cores') {
      return { type, values: Array.from(state.selectedColors) }
    }
    if (type === 'estampas' || type === 'variados') {
      const values = state.textVariations.map((v) => (v || '').trim()).filter(Boolean)
      return { type, values }
    }
    return { type: '', values: [] }
  }

  function validateForm() {
    const fd = new FormData(productForm)
    if (!String(fd.get('cliente') || '').trim()) throw new Error('Informe a empresa / loja.')
    if (!String(fd.get('solicitanteNome') || '').trim()) throw new Error('Informe seu nome de contato.')
    if (!String(fd.get('productName') || '').trim()) throw new Error('Informe o nome do produto.')
    const cost = Number(String(fd.get('productCost') || '').replace(',', '.'))
    if (!Number.isFinite(cost) || cost < 0) throw new Error('Informe um custo valido.')

    if (state.selectedSizes.size === 0) throw new Error('Selecione ao menos um tamanho.')

    const entries = collectMeasurements()
    const sizesWithMeasure = new Set(entries.map((e) => e.size))
    const missing = Array.from(state.selectedSizes).filter((s) => !sizesWithMeasure.has(s))
    if (missing.length > 0) {
      throw new Error(`Preencha a tabela de medidas para: ${missing.join(', ')}.`)
    }

    const { type, values } = collectVariations()
    if (!type) throw new Error('Selecione um tipo de variacao.')
    if (values.length === 0) {
      if (type === 'cores') throw new Error('Selecione ao menos uma cor.')
      if (type === 'estampas') throw new Error('Informe ao menos uma estampa.')
      throw new Error('Informe ao menos uma variacao.')
    }

    if (state.images.length === 0) throw new Error('Adicione pelo menos uma imagem.')
  }

  function buildSubmitFormData() {
    const fd = new FormData()
    const form = new FormData(productForm)
    fd.append('cliente', String(form.get('cliente') || '').trim())
    fd.append('solicitanteNome', String(form.get('solicitanteNome') || '').trim())
    fd.append('productName', String(form.get('productName') || '').trim())
    fd.append('productCost', String(form.get('productCost') || '').replace(',', '.'))
    fd.append('notes', String(form.get('notes') || '').trim())

    const sizes = Array.from(state.selectedSizes)
    fd.append('sizes', JSON.stringify(sizes))
    fd.append('sizeChartEntries', JSON.stringify(collectMeasurements()))

    const variation = collectVariations()
    fd.append('variationType', variation.type)
    fd.append('variations', JSON.stringify(variation.values))

    state.images.forEach((entry) => {
      fd.append('images', entry.file, entry.file.name)
    })
    return fd
  }

  function onSubmitSuccess(data) {
    successId.textContent = data.requestId || ''
    if (data.folderUrl) {
      successFolder.href = data.folderUrl
      successFolder.textContent = data.folderUrl
      successFolder.parentElement.style.display = ''
    } else {
      successFolder.parentElement.style.display = 'none'
    }
    setView('success')
    resetForm()
  }

  function resetForm() {
    productForm.reset()
    state.selectedSizes.clear()
    state.selectedColors.clear()
    state.textVariations = ['']
    state.images.forEach((entry) => URL.revokeObjectURL(entry.url))
    state.images = []
    clearNode(sizeChartList)
    sizeChartWrapper.hidden = true
    variationColors.hidden = true
    variationText.hidden = true
    renderImagesPreview()
    // Reset visuais dos chips (tamanhos e cores)
    document.querySelectorAll('#sizes-groups .chip, #colors-list .chip').forEach((chip) => {
      chip.classList.remove('is-active')
      const input = chip.querySelector('input[type="checkbox"]')
      if (input) input.checked = false
    })
    submitError.textContent = ''
  }

  newRequestBtn.addEventListener('click', () => {
    setView('form')
  })

  // ---------- Boot ----------

  async function applySession(session) {
    if (session) {
      sessionEmail.textContent = session.user && session.user.email ? session.user.email : ''
      setView('form')
      try {
        await ensureFormDataLoaded()
      } catch (err) {
        submitError.textContent = err.message || 'Falha ao carregar dados do formulario.'
      }
    } else {
      setView('login')
    }
  }

  async function boot() {
    try {
      const session = await Auth.init()
      Auth.onChange(applySession)
      await applySession(session)
    } catch (err) {
      views.loading.textContent = err.message || 'Erro ao iniciar aplicacao.'
    }
  }

  boot()
})()
