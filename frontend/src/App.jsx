import { useEffect, useRef, useState } from 'react'
import { Rnd } from 'react-rnd'
import './App.css'

const API_ROOT = import.meta.env.VITE_API_BASE_URL ?? ''
const DEMO_DESIGN_URL = '/demo/electronics-design.png'
const INITIAL_PLACEMENT = { x: 0.16, y: 0.1, width: 0.68 }
const INITIAL_AREA = { x: 0.26, y: 0.22, width: 0.48, height: 0.42 }
const AREA_MIN_SIZE = 0.08
const VIEW_OPTIONS = [
  { key: 'front', title: 'Front View', shortLabel: 'Front', sortOrder: 0 },
  { key: 'left', title: 'Left View', shortLabel: 'Left', sortOrder: 1 },
  { key: 'back', title: 'Back View', shortLabel: 'Back', sortOrder: 2 },
  { key: 'right', title: 'Right View', shortLabel: 'Right', sortOrder: 3 },
]

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum)
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`
}

function extractErrorMessage(payload, fallbackMessage) {
  if (!payload) {
    return fallbackMessage
  }

  if (typeof payload.detail === 'string') {
    return payload.detail
  }

  const firstValue = Object.values(payload)[0]
  if (Array.isArray(firstValue) && firstValue[0]) {
    return firstValue[0]
  }

  if (typeof firstValue === 'string') {
    return firstValue
  }

  return fallbackMessage
}

function revokeObjectUrl(url) {
  if (url) {
    URL.revokeObjectURL(url)
  }
}

function normalizeArea(nextArea, minimumSize = AREA_MIN_SIZE) {
  const safeWidth = clamp(nextArea.width, minimumSize, 1)
  const safeHeight = clamp(nextArea.height, minimumSize, 1)
  const safeX = clamp(nextArea.x, 0, Math.max(0, 1 - safeWidth))
  const safeY = clamp(nextArea.y, 0, Math.max(0, 1 - safeHeight))

  return {
    x: safeX,
    y: safeY,
    width: clamp(safeWidth, minimumSize, 1 - safeX),
    height: clamp(safeHeight, minimumSize, 1 - safeY),
  }
}

function createBuilderSlotState(viewKey) {
  const slotConfig =
    VIEW_OPTIONS.find((option) => option.key === viewKey) ?? VIEW_OPTIONS[0]

  return {
    label: slotConfig.title,
    viewKey: slotConfig.key,
    sortOrder: String(slotConfig.sortOrder),
    image: null,
    printArea: { ...INITIAL_AREA },
  }
}

function createInitialBuilderSlots() {
  return Object.fromEntries(
    VIEW_OPTIONS.map((option) => [option.key, createBuilderSlotState(option.key)]),
  )
}

function areaFromView(view) {
  if (!view) {
    return { ...INITIAL_AREA }
  }

  return normalizeArea({
    x: view.print_area.x / view.image_width,
    y: view.print_area.y / view.image_height,
    width: view.print_area.width / view.image_width,
    height: view.print_area.height / view.image_height,
  })
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(file)
    const image = new window.Image()

    image.onload = () => {
      resolve({
        file,
        src: sourceUrl,
        objectUrl: sourceUrl,
        width: image.naturalWidth,
        height: image.naturalHeight,
        name: file.name,
      })
    }

    image.onerror = () => {
      revokeObjectUrl(sourceUrl)
      reject(new Error('That file could not be read as an image.'))
    }

    image.src = sourceUrl
  })
}

function App() {
  const [products, setProducts] = useState([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedViewId, setSelectedViewId] = useState('')
  const [design, setDesign] = useState(null)
  const [placement, setPlacement] = useState(INITIAL_PLACEMENT)
  const [rotation, setRotation] = useState(0)
  const [editorPrintArea, setEditorPrintArea] = useState({ ...INITIAL_AREA })
  const [editorCanvasSize, setEditorCanvasSize] = useState({ width: 0, height: 0 })
  const [printAreaSize, setPrintAreaSize] = useState({ width: 0, height: 0 })
  const [isEditingPrintArea, setIsEditingPrintArea] = useState(false)
  const [isSavingPrintArea, setIsSavingPrintArea] = useState(false)
  const [printAreaStatus, setPrintAreaStatus] = useState('')
  const [isLoadingProducts, setIsLoadingProducts] = useState(true)
  const [isRendering, setIsRendering] = useState(false)
  const [renderError, setRenderError] = useState('')
  const [renderedPreviewUrl, setRenderedPreviewUrl] = useState('')
  const [layerPreviewUrl, setLayerPreviewUrl] = useState('')

  const [builderMode, setBuilderMode] = useState('existing')
  const [builderProductId, setBuilderProductId] = useState('')
  const [builderName, setBuilderName] = useState('')
  const [builderDescription, setBuilderDescription] = useState('')
  const [builderSlots, setBuilderSlots] = useState(() => createInitialBuilderSlots())
  const [activeBuilderSlotKey, setActiveBuilderSlotKey] = useState('front')
  const [builderCanvasSize, setBuilderCanvasSize] = useState({ width: 0, height: 0 })
  const [isSavingBuilder, setIsSavingBuilder] = useState(false)
  const [builderError, setBuilderError] = useState('')
  const [builderStatus, setBuilderStatus] = useState('')

  const editorCanvasRef = useRef(null)
  const printAreaRef = useRef(null)
  const builderCanvasRef = useRef(null)
  const designRef = useRef(null)
  const layerPreviewCanvasRef = useRef(null)
  const renderedPreviewRef = useRef('')
  const builderSlotsRef = useRef(builderSlots)
  const cachedImagesRef = useRef({
    productImg: null,
    designImg: null,
    productSrc: null,
    designSrc: null,
  })

  const selectedProduct = products.find(
    (product) => String(product.id) === selectedProductId,
  )
  const selectedViews = selectedProduct?.views ?? []
  const selectedView =
    selectedViews.find((view) => String(view.id) === selectedViewId) ??
    selectedViews[0]
  const selectedViewIndex = selectedViews.findIndex(
    (view) => String(view.id) === String(selectedView?.id ?? ''),
  )

  const activeBuilderOption =
    VIEW_OPTIONS.find((option) => option.key === activeBuilderSlotKey) ??
    VIEW_OPTIONS[0]
  const activeBuilderSlot =
    builderSlots[activeBuilderOption.key] ??
    createBuilderSlotState(activeBuilderOption.key)
  const activeBuilderImage = activeBuilderSlot.image
  const activeBuilderPrintArea = normalizeArea(activeBuilderSlot.printArea)
  const configuredBuilderOptions = VIEW_OPTIONS.filter(
    (option) => builderSlots[option.key]?.image,
  )

  const designAspectRatio = design ? design.width / design.height : 1
  const sizingFrame =
    printAreaSize.width > 0 && printAreaSize.height > 0
      ? printAreaSize
      : {
          width: Math.max(1, selectedView?.print_area.width ?? 1),
          height: Math.max(1, selectedView?.print_area.height ?? 1),
        }
  const liveAreaReady = printAreaSize.width > 0 && printAreaSize.height > 0
  const maxWidthRatio = Math.min(
    0.94,
    designAspectRatio * (sizingFrame.height / sizingFrame.width),
  )
  const minWidthRatio = Math.min(0.12, maxWidthRatio)
  const heightRatio =
    (sizingFrame.width * placement.width) / designAspectRatio / sizingFrame.height
  const maxYRatio = Math.max(0, 1 - heightRatio)

  const overlayWidth = printAreaSize.width * placement.width
  const overlayHeight = overlayWidth / designAspectRatio
  const staticDesignStyle = {
    left: `${printAreaSize.width * placement.x}px`,
    top: `${printAreaSize.height * placement.y}px`,
    width: `${overlayWidth}px`,
    height: `${overlayHeight}px`,
  }

  const builderCanvasReady =
    Boolean(activeBuilderImage) &&
    builderCanvasSize.width > 0 &&
    builderCanvasSize.height > 0
  const builderMaxX = Math.max(0, 1 - activeBuilderPrintArea.width)
  const builderMaxY = Math.max(0, 1 - activeBuilderPrintArea.height)
  const builderMaxWidth = Math.max(AREA_MIN_SIZE, 1 - activeBuilderPrintArea.x)
  const builderMaxHeight = Math.max(AREA_MIN_SIZE, 1 - activeBuilderPrintArea.y)
  const builderPixelRect = activeBuilderImage
    ? {
        x: Math.round(activeBuilderPrintArea.x * activeBuilderImage.width),
        y: Math.round(activeBuilderPrintArea.y * activeBuilderImage.height),
        width: Math.round(activeBuilderPrintArea.width * activeBuilderImage.width),
        height: Math.round(activeBuilderPrintArea.height * activeBuilderImage.height),
      }
    : null

  function clampPlacement(nextPlacement, aspectRatio = designAspectRatio) {
    const maxWidthFromHeight = aspectRatio * (sizingFrame.height / sizingFrame.width)
    const safeMaxWidth = Math.min(0.94, maxWidthFromHeight)
    const safeMinWidth = Math.min(0.12, safeMaxWidth)
    const safeWidth = clamp(nextPlacement.width, safeMinWidth, safeMaxWidth)
    const nextHeightRatio =
      (sizingFrame.width * safeWidth) / aspectRatio / sizingFrame.height

    return {
      width: safeWidth,
      x: clamp(nextPlacement.x, 0, Math.max(0, 1 - safeWidth)),
      y: clamp(nextPlacement.y, 0, Math.max(0, 1 - nextHeightRatio)),
    }
  }

  async function fetchProducts(options = {}) {
    const {
      preferredProductId = null,
      preferredViewId = null,
      preferredBuilderProductId = null,
      silent = false,
    } = options

    if (!silent) {
      setIsLoadingProducts(true)
    }

    try {
      const response = await fetch(`${API_ROOT}/api/products/`)
      if (!response.ok) {
        throw new Error('Unable to load products.')
      }

      const data = await response.json()
      const nextProducts = data.products ?? []
      setProducts(nextProducts)

      // Start with blank slate - no default product/view selected
      const nextSelectedProductId = preferredProductId ?? selectedProductId
      const nextSelectedProduct = nextProducts.find(
        (product) => String(product.id) === nextSelectedProductId,
      )
      const nextSelectedViewId = preferredViewId ?? selectedViewId

      setSelectedProductId(nextSelectedProductId)
      setSelectedViewId(nextSelectedViewId)

      const nextBuilderProductId =
        preferredBuilderProductId ??
        (nextProducts.some((product) => String(product.id) === builderProductId)
          ? builderProductId
          : String(nextProducts[0]?.id ?? ''))

      setBuilderProductId(nextBuilderProductId)
      setRenderError('')
    } catch (error) {
      setRenderError(error.message)
    } finally {
      if (!silent) {
        setIsLoadingProducts(false)
      }
    }
  }

  function updateProductViewInState(updatedView) {
    setProducts((currentProducts) =>
      currentProducts.map((product) => {
        if (String(product.id) !== String(updatedView.product_id ?? selectedProductId)) {
          return product
        }

        return {
          ...product,
          views: product.views.map((view) =>
            String(view.id) === String(updatedView.id) ? updatedView : view,
          ),
        }
      }),
    )
  }

  function resetRenderedPreview() {
    setRenderedPreviewUrl((currentUrl) => {
      revokeObjectUrl(currentUrl)
      return ''
    })
  }

  function deleteDesign() {
    // Revoke object URLs
    if (design?.objectUrl) {
      revokeObjectUrl(design.objectUrl)
    }
    
    // Clear design and reset states
    setDesign(null)
    setPlacement(clampPlacement(INITIAL_PLACEMENT))
    setRotation(0)
    setLayerPreviewUrl((currentUrl) => {
      revokeObjectUrl(currentUrl)
      return ''
    })
    resetRenderedPreview()
  }

  function updateBuilderSlot(slotKey, updater) {
    setBuilderSlots((currentSlots) => {
      const currentSlot = currentSlots[slotKey]
      const nextSlot =
        typeof updater === 'function'
          ? updater(currentSlot)
          : { ...currentSlot, ...updater }

      return {
        ...currentSlots,
        [slotKey]: nextSlot,
      }
    })
  }

  function resetBuilder(options = {}) {
    const { keepStatus = false } = options

    setBuilderSlots((currentSlots) => {
      Object.values(currentSlots).forEach((slot) => {
        revokeObjectUrl(slot.image?.objectUrl)
      })
      return createInitialBuilderSlots()
    })

    setActiveBuilderSlotKey('front')
    setBuilderError('')
    if (!keepStatus) {
      setBuilderStatus('')
    }
  }

  function clearBuilderSlot(slotKey) {
    const fallbackKey =
      VIEW_OPTIONS.find(
        (option) => option.key !== slotKey && builderSlots[option.key]?.image,
      )?.key ?? 'front'

    setBuilderSlots((currentSlots) => {
      revokeObjectUrl(currentSlots[slotKey].image?.objectUrl)
      return {
        ...currentSlots,
        [slotKey]: createBuilderSlotState(slotKey),
      }
    })

    if (activeBuilderSlotKey === slotKey) {
      setActiveBuilderSlotKey(fallbackKey)
    }

    setBuilderError('')
    setBuilderStatus('')
  }

  async function applyDesignFile(file) {
    try {
      const asset = await readImageFile(file)
      setDesign((currentDesign) => {
        revokeObjectUrl(currentDesign?.objectUrl)
        return asset
      })
      setPlacement((currentPlacement) =>
        clampPlacement(currentPlacement, asset.width / asset.height),
      )
      setRenderError('')
      resetRenderedPreview()
    } catch (error) {
      setRenderError(error.message)
    }
  }

  function handleUpload(event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    applyDesignFile(file)
  }

  function handleProductChange(event) {
    const productId = event.target.value
    setSelectedProductId(productId)

    const nextProduct = products.find((product) => String(product.id) === productId)
    const nextView = nextProduct?.views?.[0]
    setSelectedViewId(nextView ? String(nextView.id) : '')
    setPrintAreaStatus('')
    setIsEditingPrintArea(false)
  }

  function handleViewChange(event) {
    setSelectedViewId(event.target.value)
    setPrintAreaStatus('')
    setIsEditingPrintArea(false)
  }

  function goToAdjacentView(direction) {
    if (!selectedViews.length || selectedViewIndex < 0) {
      return
    }

    const nextIndex = clamp(
      selectedViewIndex + direction,
      0,
      Math.max(0, selectedViews.length - 1),
    )
    const nextView = selectedViews[nextIndex]
    if (nextView) {
      setSelectedViewId(String(nextView.id))
      setPrintAreaStatus('')
      setIsEditingPrintArea(false)
    }
  }

  function redrawLayerPreview() {
    // Fast redraw using cached images - no loading
    if (!selectedView || !design?.src) {
      return
    }

    const cache = cachedImagesRef.current
    const canvas = layerPreviewCanvasRef.current
    if (!canvas || !cache.productImg || !cache.designImg) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas to match product image dimensions
    canvas.width = cache.productImg.width
    canvas.height = cache.productImg.height

    // Draw product image
    ctx.drawImage(cache.productImg, 0, 0)

    // Calculate design position and size based on placement
    const printArea = {
      x: selectedView.print_area.x,
      y: selectedView.print_area.y,
      width: selectedView.print_area.width,
      height: selectedView.print_area.height,
    }

    // Calculate design dimensions maintaining aspect ratio
    const designAspect = cache.designImg.naturalWidth / cache.designImg.naturalHeight
    const targetWidth = Math.round(printArea.width * placement.width)
    const targetHeight = Math.round(targetWidth / designAspect)

    // Calculate position within print area
    // placement.x and placement.y are normalized coordinates (0-1) within the print area
    const targetX = Math.round(printArea.x + printArea.width * placement.x)
    const targetY = Math.round(printArea.y + printArea.height * placement.y)

    // Draw design on top
    ctx.globalAlpha = 0.9
    ctx.drawImage(cache.designImg, targetX, targetY, targetWidth, targetHeight)
    ctx.globalAlpha = 1.0

    // Convert canvas to blob with error handling
    try {
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob)
          setLayerPreviewUrl((currentUrl) => {
            if (currentUrl) URL.revokeObjectURL(currentUrl)
            return url
          })
        }
      }, 'image/png')
    } catch (error) {
      console.warn('Canvas toBlob failed (expected for cross-origin images):', error)
      // Fallback: use toDataURL instead
      const url = canvas.toDataURL('image/png')
      setLayerPreviewUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl)
        return url
      })
    }
  }

  function loadLayerPreviewImages() {
    // Load images only when they change, not on every position update
    if (!selectedView || !design?.src) {
      return
    }

    const cache = cachedImagesRef.current
    let imagesLoaded = 0

    const checkBothLoaded = () => {
      imagesLoaded++
      if (imagesLoaded === 2) {
        // Both images loaded, now redraw
        redrawLayerPreview()
      }
    }

    // Load product image if not cached or if source changed
    if (!cache.productImg || cache.productSrc !== selectedView.image_url) {
      const productImg = new Image()
      productImg.crossOrigin = 'anonymous'
      productImg.onload = () => {
        cache.productImg = productImg
        cache.productSrc = selectedView.image_url
        checkBothLoaded()
      }
      productImg.onerror = () => {
        console.error('Failed to load product image')
      }
      productImg.src = selectedView.image_url
    } else {
      imagesLoaded++
    }

    // Load design image if not cached or if source changed
    if (!cache.designImg || cache.designSrc !== design.src) {
      const designImg = new Image()
      designImg.crossOrigin = 'anonymous'
      designImg.onload = () => {
        cache.designImg = designImg
        cache.designSrc = design.src
        checkBothLoaded()
      }
      designImg.onerror = () => {
        console.error('Failed to load design image')
      }
      designImg.src = design.src
    } else {
      imagesLoaded++
    }

    // If both are cached, redraw immediately
    if (imagesLoaded === 2) {
      redrawLayerPreview()
    }
  }

  async function handleRenderPreview() {
    if (!selectedView || !design?.file) {
      return
    }

    const payload = new FormData()
    payload.append('product_view_id', selectedView.id)
    payload.append('design', design.file)
    payload.append('x_ratio', placement.x.toFixed(4))
    payload.append('y_ratio', placement.y.toFixed(4))
    payload.append('width_ratio', placement.width.toFixed(4))
    payload.append('rotation', rotation.toFixed(1))
    payload.append('print_area_x_ratio', editorPrintArea.x.toFixed(4))
    payload.append('print_area_y_ratio', editorPrintArea.y.toFixed(4))
    payload.append('print_area_width_ratio', editorPrintArea.width.toFixed(4))
    payload.append('print_area_height_ratio', editorPrintArea.height.toFixed(4))

    setIsRendering(true)
    setRenderError('')

    try {
      const response = await fetch(`${API_ROOT}/api/render-preview/`, {
        method: 'POST',
        body: payload,
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null)
        throw new Error(
          extractErrorMessage(errorPayload, 'Render failed. Check that Django is running.'),
        )
      }

      const blob = await response.blob()
      const previewUrl = URL.createObjectURL(blob)

      setRenderedPreviewUrl((currentUrl) => {
        revokeObjectUrl(currentUrl)
        return previewUrl
      })
    } catch (error) {
      setRenderError(error.message)
    } finally {
      setIsRendering(false)
    }
  }

  async function handleSavePrintArea() {
    if (!selectedView) {
      return
    }

    setIsSavingPrintArea(true)
    setPrintAreaStatus('')
    setRenderError('')

    try {
      const response = await fetch(
        `${API_ROOT}/api/manage/product-views/${selectedView.id}/print-area/`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            print_area_x_ratio: Number(editorPrintArea.x.toFixed(4)),
            print_area_y_ratio: Number(editorPrintArea.y.toFixed(4)),
            print_area_width_ratio: Number(editorPrintArea.width.toFixed(4)),
            print_area_height_ratio: Number(editorPrintArea.height.toFixed(4)),
          }),
        },
      )

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null)
        throw new Error(
          extractErrorMessage(
            errorPayload,
            'Could not save the print area for this view.',
          ),
        )
      }

      const updatedView = await response.json()
      updateProductViewInState(updatedView)
      setEditorPrintArea(areaFromView(updatedView))
      setPrintAreaStatus(`Saved ${updatedView.label} print area.`)
      setIsEditingPrintArea(false)
    } catch (error) {
      setRenderError(error.message)
    } finally {
      setIsSavingPrintArea(false)
    }
  }

  function resetEditorPrintArea() {
    setEditorPrintArea(areaFromView(selectedView))
    setPrintAreaStatus('')
  }

  async function handleBuilderImageUpload(slotKey, event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const asset = await readImageFile(file)
      setBuilderSlots((currentSlots) => {
        revokeObjectUrl(currentSlots[slotKey].image?.objectUrl)
        return {
          ...currentSlots,
          [slotKey]: {
            ...currentSlots[slotKey],
            image: asset,
            printArea: { ...INITIAL_AREA },
          },
        }
      })
      setActiveBuilderSlotKey(slotKey)
      setBuilderError('')
      setBuilderStatus('')
    } catch (error) {
      setBuilderError(error.message)
    }
  }

  async function handleSaveBuilder() {
    setBuilderError('')
    setBuilderStatus('')

    const configuredSlots = VIEW_OPTIONS.filter(
      (option) => builderSlots[option.key]?.image,
    )

    if (configuredSlots.length === 0) {
      setBuilderError('Add at least one product view before saving.')
      return
    }

    let productId = builderProductId

    if (builderMode === 'new') {
      if (!builderName.trim()) {
        setBuilderError('Enter a product name before saving.')
        return
      }
    } else if (!builderProductId) {
      setBuilderError('Choose an existing product or switch to New product.')
      return
    }

    setIsSavingBuilder(true)

    try {
      if (builderMode === 'new') {
        const createProductResponse = await fetch(`${API_ROOT}/api/manage/products/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: builderName.trim(),
            description: builderDescription.trim(),
          }),
        })

        if (!createProductResponse.ok) {
          const errorPayload = await createProductResponse.json().catch(() => null)
          throw new Error(
            extractErrorMessage(errorPayload, 'Could not create the product record.'),
          )
        }

        const createdProduct = await createProductResponse.json()
        productId = String(createdProduct.id)
      }

      const createdViews = []

      for (const option of configuredSlots) {
        const slot = builderSlots[option.key]
        const payload = new FormData()
        payload.append('product_id', productId)
        payload.append('label', slot.label)
        payload.append('view_key', slot.viewKey)
        payload.append('sort_order', slot.sortOrder || String(option.sortOrder))
        payload.append('base_image', slot.image.file)
        payload.append('print_area_x_ratio', slot.printArea.x.toFixed(4))
        payload.append('print_area_y_ratio', slot.printArea.y.toFixed(4))
        payload.append('print_area_width_ratio', slot.printArea.width.toFixed(4))
        payload.append('print_area_height_ratio', slot.printArea.height.toFixed(4))

        const createViewResponse = await fetch(`${API_ROOT}/api/manage/product-views/`, {
          method: 'POST',
          body: payload,
        })

        if (!createViewResponse.ok) {
          const errorPayload = await createViewResponse.json().catch(() => null)
          throw new Error(
            extractErrorMessage(
              errorPayload,
              `Could not save the ${option.shortLabel.toLowerCase()} view.`,
            ),
          )
        }

        createdViews.push(await createViewResponse.json())
      }

      const preferredView =
        createdViews.find((view) => view.view_key === activeBuilderSlotKey) ??
        createdViews[0]

      await fetchProducts({
        preferredProductId: productId,
        preferredViewId: String(preferredView.id),
        preferredBuilderProductId: productId,
        silent: true,
      })

      setSelectedProductId(productId)
      setSelectedViewId(String(preferredView.id))
      setBuilderProductId(productId)
      setBuilderMode('existing')
      setBuilderName('')
      setBuilderDescription('')
      resetBuilder({ keepStatus: true })
      setBuilderStatus(
        `${createdViews.length} product view${createdViews.length > 1 ? 's' : ''} saved.`,
      )
    } catch (error) {
      setBuilderError(error.message)
    } finally {
      setIsSavingBuilder(false)
    }
  }

  useEffect(() => {
    designRef.current = design
  }, [design])

  useEffect(() => {
    renderedPreviewRef.current = renderedPreviewUrl
  }, [renderedPreviewUrl])

  useEffect(() => {
    builderSlotsRef.current = builderSlots
  }, [builderSlots])

  useEffect(() => {
    fetchProducts()
  }, [])

  // Demo design auto-load disabled - start with blank slate
  // Uncomment the useEffect below to restore auto-loading demo design
  /*
  useEffect(() => {
    let ignore = false

    async function loadDemoDesign() {
      try {
        const response = await fetch(DEMO_DESIGN_URL)
        const blob = await response.blob()
        const file = new File([blob], 'electronics-design.png', {
          type: blob.type || 'image/png',
        })
        const asset = await readImageFile(file)

        if (ignore) {
          revokeObjectUrl(asset.objectUrl)
          return
        }

        setDesign((currentDesign) => {
          revokeObjectUrl(currentDesign?.objectUrl)
          return asset
        })
      } catch {
        if (!ignore) {
          setRenderError('Could not load the demo design image.')
        }
      }
    }

    loadDemoDesign()

    return () => {
      ignore = true
    }
  }, [])
  */

  useEffect(() => {
    return () => {
      revokeObjectUrl(designRef.current?.objectUrl)
      revokeObjectUrl(renderedPreviewRef.current)
      Object.values(builderSlotsRef.current ?? {}).forEach((slot) => {
        revokeObjectUrl(slot.image?.objectUrl)
      })
    }
  }, [])

  useEffect(() => {
    if (!editorCanvasRef.current) {
      return undefined
    }

    const observer = new ResizeObserver(([entry]) => {
      setEditorCanvasSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })

    observer.observe(editorCanvasRef.current)
    return () => observer.disconnect()
  }, [selectedView?.id])

  useEffect(() => {
    if (!printAreaRef.current) {
      return undefined
    }

    const observer = new ResizeObserver(([entry]) => {
      setPrintAreaSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })

    observer.observe(printAreaRef.current)
    return () => observer.disconnect()
  }, [selectedView?.id, isEditingPrintArea, editorPrintArea.x, editorPrintArea.y, editorPrintArea.width, editorPrintArea.height])

  useEffect(() => {
    if (!builderCanvasRef.current) {
      return undefined
    }

    const observer = new ResizeObserver(([entry]) => {
      setBuilderCanvasSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })

    observer.observe(builderCanvasRef.current)
    return () => observer.disconnect()
  }, [activeBuilderImage?.src, activeBuilderSlotKey])

  useEffect(() => {
    if (!isLoadingProducts && products.length === 0) {
      setBuilderMode('new')
    }
  }, [isLoadingProducts, products.length])

  useEffect(() => {
    if (!selectedView) {
      setEditorPrintArea({ ...INITIAL_AREA })
      return
    }

    setEditorPrintArea(areaFromView(selectedView))
    setIsEditingPrintArea(false)
    setPrintAreaStatus('')
  }, [selectedView?.id])

  useEffect(() => {
    if (!selectedView || !design) {
      return
    }

    setPlacement((currentPlacement) => clampPlacement(currentPlacement))
  }, [selectedView?.id, designAspectRatio, printAreaSize.width, printAreaSize.height])

  useEffect(() => {
    // Load images when design or view changes
    loadLayerPreviewImages()
  }, [selectedView?.id, design?.src])

  useEffect(() => {
    // Just redraw with cached images when placement changes (smooth, no reloading)
    redrawLayerPreview()
  }, [placement, rotation])

  const printAreaStyle = selectedView
    ? {
        left: `${editorPrintArea.x * 100}%`,
        top: `${editorPrintArea.y * 100}%`,
        width: `${editorPrintArea.width * 100}%`,
        height: `${editorPrintArea.height * 100}%`,
      }
    : undefined

  return (
    <main className="app-shell">
      <canvas ref={layerPreviewCanvasRef} style={{ display: 'none' }} />
      <section className="hero-band">
        <div>
          <p className="eyebrow">Phase 2 Setup UX</p>
          <h1>Product Customizer</h1>
          <p className="hero-copy">
            Adjust the dotted print area directly on the product, move between
            views in the editor, and build multi-view products with optional
            front, left, back, and right images.
          </p>
        </div>
        <div className="hero-meta">
          <span>Editable print area</span>
          <span>Multi-view editor</span>
          <span>Optional view uploads</span>
        </div>
      </section>

      <section className="workspace">
        <aside className="panel controls-panel">
          <div className="panel-heading">
            <p className="section-tag">Customizer</p>
            <h2>Choose your product</h2>
          </div>

          <label className="field">
            <span>Product</span>
            <select
              value={selectedProductId}
              onChange={handleProductChange}
              disabled={isLoadingProducts || products.length === 0}
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>View</span>
            <select
              value={selectedViewId}
              onChange={handleViewChange}
              disabled={!selectedProduct}
            >
              {selectedViews.map((view) => (
                <option key={view.id} value={view.id}>
                  {view.label}
                </option>
              ))}
            </select>
          </label>

          <label className="upload-card" htmlFor="design-upload">
            <span className="upload-title">{design ? 'Change Design' : 'Upload Design'}</span>
            <span className="upload-copy">
              Transparent PNG works best for the editor and preview export.
            </span>
            <input
              id="design-upload"
              type="file"
              accept="image/*"
              onChange={handleUpload}
            />
          </label>

          <div className="design-actions">
            <button
              className="secondary-action"
              type="button"
              onClick={() => {
                setPlacement(clampPlacement(INITIAL_PLACEMENT))
                setRotation(0)
                resetRenderedPreview()
              }}
              disabled={!design}
            >
              Reset Design Placement
            </button>

            <button
              className="secondary-action danger"
              type="button"
              onClick={deleteDesign}
              disabled={!design}
            >
              Delete Design
            </button>
          </div>

          <div className="panel-heading compact">
            <p className="section-tag">Controller</p>
            <h2>Design placement</h2>
          </div>

          <label className="field">
            <span>Horizontal position</span>
            <input
              type="range"
              min="0"
              max={Math.max(0, 1 - placement.width)}
              step="0.01"
              value={placement.x}
              onChange={(event) => {
                setPlacement((currentPlacement) =>
                  clampPlacement({
                    ...currentPlacement,
                    x: Number(event.target.value),
                  }),
                )
              }}
            />
            <strong>{formatPercent(placement.x)}</strong>
          </label>

          <label className="field">
            <span>Vertical position</span>
            <input
              type="range"
              min="0"
              max={maxYRatio}
              step="0.01"
              value={placement.y}
              onChange={(event) => {
                setPlacement((currentPlacement) =>
                  clampPlacement({
                    ...currentPlacement,
                    y: Number(event.target.value),
                  }),
                )
              }}
            />
            <strong>{formatPercent(placement.y)}</strong>
          </label>

          <label className="field">
            <span>Scale</span>
            <input
              type="range"
              min={minWidthRatio}
              max={maxWidthRatio}
              step="0.01"
              value={placement.width}
              onChange={(event) => {
                setPlacement((currentPlacement) =>
                  clampPlacement({
                    ...currentPlacement,
                    width: Number(event.target.value),
                  }),
                )
              }}
            />
            <strong>{formatPercent(placement.width)}</strong>
          </label>

          <label className="field">
            <span>Rotation</span>
            <input
              type="range"
              min="-45"
              max="45"
              step="1"
              value={rotation}
              onChange={(event) => {
                setRotation(Number(event.target.value))
              }}
            />
            <strong>{rotation}°</strong>
          </label>

          <button
            className="primary-action"
            type="button"
            onClick={handleRenderPreview}
            disabled={!selectedView || !design?.file || isRendering}
          >
            {isRendering ? 'Rendering...' : 'Generate server preview'}
          </button>

          {renderError ? <p className="status error">{renderError}</p> : null}
          {printAreaStatus ? <p className="status success">{printAreaStatus}</p> : null}
        </aside>

        <section className="panel editor-panel">
          <div className="panel-heading">
            <p className="section-tag">Realtime Placement Editor</p>
            <h2>Edit design and print area on the canvas</h2>
          </div>

          <div className="editor-toolbar">
            <div className="view-switcher">
              <button
                type="button"
                className="toolbar-button"
                onClick={() => goToAdjacentView(-1)}
                disabled={selectedViewIndex <= 0}
              >
                Previous view
              </button>
              <span className="view-counter">
                {selectedViews.length > 0 ? selectedViewIndex + 1 : 0} /{' '}
                {selectedViews.length}
              </span>
              <button
                type="button"
                className="toolbar-button"
                onClick={() => goToAdjacentView(1)}
                disabled={
                  selectedViewIndex < 0 || selectedViewIndex >= selectedViews.length - 1
                }
              >
                Next view
              </button>
            </div>

            <div className="print-area-tools">
              <button
                type="button"
                className={isEditingPrintArea ? 'toolbar-button active' : 'toolbar-button'}
                onClick={() => {
                  setIsEditingPrintArea((currentValue) => !currentValue)
                  setPrintAreaStatus('')
                }}
                disabled={!selectedView}
              >
                {isEditingPrintArea ? 'Lock print area' : 'Adjust print area'}
              </button>
              <button
                type="button"
                className="toolbar-button"
                onClick={handleSavePrintArea}
                disabled={!selectedView || !isEditingPrintArea || isSavingPrintArea}
              >
                {isSavingPrintArea ? 'Saving...' : 'Save print area'}
              </button>
              <button
                type="button"
                className="toolbar-button"
                onClick={resetEditorPrintArea}
                disabled={!selectedView}
              >
                Reset area
              </button>
            </div>
          </div>

          <div className="editor-stage">
            {selectedView ? (
              <div ref={editorCanvasRef} className="product-stage">
                <img
                  className="product-photo"
                  src={selectedView.image_url}
                  alt={`${selectedProduct?.name} ${selectedView.label}`}
                />

                {isEditingPrintArea ? (
                  <Rnd
                    className="print-area-shell"
                    bounds="parent"
                    size={{
                      width: editorCanvasSize.width * editorPrintArea.width,
                      height: editorCanvasSize.height * editorPrintArea.height,
                    }}
                    position={{
                      x: editorCanvasSize.width * editorPrintArea.x,
                      y: editorCanvasSize.height * editorPrintArea.y,
                    }}
                    minWidth={Math.max(48, editorCanvasSize.width * AREA_MIN_SIZE)}
                    minHeight={Math.max(48, editorCanvasSize.height * AREA_MIN_SIZE)}
                    onDragStop={(_event, data) => {
                      setEditorPrintArea((currentArea) =>
                        normalizeArea({
                          ...currentArea,
                          x: data.x / editorCanvasSize.width,
                          y: data.y / editorCanvasSize.height,
                        }),
                      )
                    }}
                    onResizeStop={(_event, _direction, ref, _delta, position) => {
                      setEditorPrintArea(
                        normalizeArea({
                          x: position.x / editorCanvasSize.width,
                          y: position.y / editorCanvasSize.height,
                          width: ref.offsetWidth / editorCanvasSize.width,
                          height: ref.offsetHeight / editorCanvasSize.height,
                        }),
                      )
                    }}
                  >
                    <div ref={printAreaRef} className="print-area-overlay editable">
                      <div className="print-area-badge">Print area</div>
                      {design && liveAreaReady ? (
                        <div className="design-static-frame" style={staticDesignStyle}>
                          <img
                            className="design-overlay"
                            src={design.src}
                            alt={design.name}
                          />
                        </div>
                      ) : null}
                    </div>
                  </Rnd>
                ) : (
                  <div
                    ref={printAreaRef}
                    className="print-area-overlay"
                    style={printAreaStyle}
                  >
                    <div className="print-area-badge">Print area</div>

                    {design && liveAreaReady ? (
                      <Rnd
                        className="design-rnd"
                        bounds="parent"
                        lockAspectRatio
                        size={{
                          width: overlayWidth || 0,
                          height: overlayHeight || 0,
                        }}
                        position={{
                          x: printAreaSize.width * placement.x,
                          y: printAreaSize.height * placement.y,
                        }}
                        minWidth={Math.max(48, printAreaSize.width * minWidthRatio)}
                        maxWidth={printAreaSize.width * maxWidthRatio}
                        onDragStop={(_event, data) => {
                          setPlacement((currentPlacement) =>
                            clampPlacement({
                              ...currentPlacement,
                              x: data.x / printAreaSize.width,
                              y: data.y / printAreaSize.height,
                            }),
                          )
                        }}
                        onResizeStop={(_event, _direction, ref, _delta, position) => {
                          setPlacement((currentPlacement) =>
                            clampPlacement({
                              ...currentPlacement,
                              x: position.x / printAreaSize.width,
                              y: position.y / printAreaSize.height,
                              width: ref.offsetWidth / printAreaSize.width,
                            }),
                          )
                        }}
                      >
                        <img
                          className="design-overlay"
                          src={design.src}
                          alt={design.name}
                        />
                      </Rnd>
                    ) : null}
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state">
                Save at least one view from the catalog builder to begin editing.
              </div>
            )}
          </div>

          <div className="metrics-row">
            <div>
              <span>Product</span>
              <strong>{selectedProduct?.name ?? 'Waiting for catalog'}</strong>
            </div>
            <div>
              <span>View</span>
              <strong>{selectedView?.label ?? '-'}</strong>
            </div>
            <div>
              <span>Print area</span>
              <strong>
                {selectedView
                  ? `${Math.round(editorPrintArea.width * 100)}% × ${Math.round(
                      editorPrintArea.height * 100,
                    )}%`
                  : '-'}
              </strong>
            </div>
          </div>
        </section>

        <aside className="panel preview-panel">
          <div className="panel-heading">
            <p className="section-tag">Output</p>
            <h2>Preview & Render</h2>
          </div>

          <div className="preview-section">
            <h3>Layer Preview (Product + Design)</h3>
            {layerPreviewUrl ? (
              <img
                className="layer-preview"
                src={layerPreviewUrl}
                alt="Layer preview"
              />
            ) : (
              <div className="preview-placeholder">
                <p>Upload a design and adjust its placement on the canvas above.</p>
              </div>
            )}

            <button
              className="primary-action"
              type="button"
              onClick={handleRenderPreview}
              disabled={!selectedView || !design?.file || isRendering}
            >
              {isRendering ? 'Generating...' : 'Generate Blended Preview'}
            </button>

            {renderError ? <p className="status error">{renderError}</p> : null}
          </div>

          <div className="preview-section">
            <h3>OpenCV Blended Result</h3>
            {renderedPreviewUrl ? (
              <>
                <img
                  className="rendered-preview"
                  src={renderedPreviewUrl}
                  alt="Rendered t-shirt preview"
                />
                <a
                  className="download-link"
                  href={renderedPreviewUrl}
                  download="mockup-preview.png"
                >
                  Download PNG
                </a>
              </>
            ) : (
              <div className="preview-placeholder">
                <p>Click "Generate Blended Preview" to create the final mockup with realistic blending.</p>
                <p>
                  The OpenCV engine will blend the design with product shadows, apply wrinkle displacement,
                  and feather the edges for a realistic result.
                </p>
              </div>
            )}
          </div>

          <div className="scope-card">
            <h3>What changed</h3>
            <ul>
              <li>The dotted print area can be moved and resized manually</li>
              <li>Each product view can be edited one by one on the same canvas</li>
              <li>Products can be created with any subset of front/left/back/right views</li>
            </ul>
          </div>
        </aside>
      </section>

      <section className="catalog-section">
        <div className="catalog-header">
          <div>
            <p className="section-tag">Catalog Builder</p>
            <h2>Upload up to four optional views under the same product</h2>
          </div>
          <p className="catalog-copy">
            Add only the views you have today. A product can start with just one
            image, or include front, left, back, and right in a single save.
          </p>
        </div>

        <div className="builder-grid">
          <aside className="panel builder-form-panel">
            <div className="mode-toggle">
              <button
                type="button"
                className={builderMode === 'existing' ? 'mode-button active' : 'mode-button'}
                onClick={() => {
                  setBuilderMode('existing')
                  setBuilderError('')
                  setBuilderStatus('')
                }}
              >
                Existing product
              </button>
              <button
                type="button"
                className={builderMode === 'new' ? 'mode-button active' : 'mode-button'}
                onClick={() => {
                  setBuilderMode('new')
                  setBuilderError('')
                  setBuilderStatus('')
                }}
              >
                New product
              </button>
            </div>

            {builderMode === 'existing' ? (
              <label className="field">
                <span>Choose product</span>
                <select
                  value={builderProductId}
                  onChange={(event) => setBuilderProductId(event.target.value)}
                  disabled={products.length === 0}
                >
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="field">
                  <span>Product name</span>
                  <input
                    type="text"
                    value={builderName}
                    onChange={(event) => setBuilderName(event.target.value)}
                    placeholder="Classic cotton tee"
                  />
                </label>
                <label className="field">
                  <span>Description</span>
                  <textarea
                    value={builderDescription}
                    onChange={(event) => setBuilderDescription(event.target.value)}
                    placeholder="Short notes for merch managers or admins."
                  />
                </label>
              </>
            )}

            <div className="panel-heading compact">
              <p className="section-tag">Views</p>
              <h2>Add one or more product angles</h2>
            </div>

            <div className="builder-slot-list">
              {VIEW_OPTIONS.map((option) => {
                const slot = builderSlots[option.key]
                const isActive = option.key === activeBuilderSlotKey
                const hasImage = Boolean(slot.image)

                return (
                  <div
                    key={option.key}
                    className={isActive ? 'builder-slot-card active' : 'builder-slot-card'}
                  >
                    <div className="builder-slot-header">
                      <div>
                        <p className="builder-slot-title">{option.title}</p>
                        <p className="builder-slot-status">
                          {hasImage ? 'Image added' : 'Optional'}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="slot-select-button"
                        onClick={() => setActiveBuilderSlotKey(option.key)}
                      >
                        {isActive ? 'Editing' : 'Edit'}
                      </button>
                    </div>

                    <label className="field field-compact">
                      <span>Upload {option.shortLabel.toLowerCase()} image</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => handleBuilderImageUpload(option.key, event)}
                      />
                    </label>

                    {hasImage ? (
                      <>
                        <p className="builder-slot-file">{slot.image.name}</p>
                        <button
                          type="button"
                          className="secondary-action slim"
                          onClick={() => clearBuilderSlot(option.key)}
                        >
                          Remove view
                        </button>
                      </>
                    ) : (
                      <p className="builder-slot-hint">
                        Skip this view if you do not need it yet.
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            {activeBuilderImage ? (
              <div className="builder-control-card">
                <div className="panel-heading compact">
                  <p className="section-tag">Print Area Controls</p>
                  <h2>{activeBuilderOption.title} print area</h2>
                </div>

                <label className="field">
                  <span>Left position</span>
                  <input
                    type="range"
                    min="0"
                    max={builderMaxX}
                    step="0.005"
                    value={activeBuilderPrintArea.x}
                    onChange={(event) => {
                      updateBuilderSlot(activeBuilderSlotKey, (currentSlot) => ({
                        ...currentSlot,
                        printArea: normalizeArea({
                          ...currentSlot.printArea,
                          x: Number(event.target.value),
                        }),
                      }))
                    }}
                  />
                  <strong>{builderPixelRect?.x ?? 0}px</strong>
                </label>

                <label className="field">
                  <span>Top position</span>
                  <input
                    type="range"
                    min="0"
                    max={builderMaxY}
                    step="0.005"
                    value={activeBuilderPrintArea.y}
                    onChange={(event) => {
                      updateBuilderSlot(activeBuilderSlotKey, (currentSlot) => ({
                        ...currentSlot,
                        printArea: normalizeArea({
                          ...currentSlot.printArea,
                          y: Number(event.target.value),
                        }),
                      }))
                    }}
                  />
                  <strong>{builderPixelRect?.y ?? 0}px</strong>
                </label>

                <label className="field">
                  <span>Print width</span>
                  <input
                    type="range"
                    min={AREA_MIN_SIZE}
                    max={builderMaxWidth}
                    step="0.005"
                    value={activeBuilderPrintArea.width}
                    onChange={(event) => {
                      updateBuilderSlot(activeBuilderSlotKey, (currentSlot) => ({
                        ...currentSlot,
                        printArea: normalizeArea({
                          ...currentSlot.printArea,
                          width: Number(event.target.value),
                        }),
                      }))
                    }}
                  />
                  <strong>
                    {builderPixelRect?.width ?? 0}px (
                    {formatPercent(activeBuilderPrintArea.width)})
                  </strong>
                </label>

                <label className="field">
                  <span>Print height</span>
                  <input
                    type="range"
                    min={AREA_MIN_SIZE}
                    max={builderMaxHeight}
                    step="0.005"
                    value={activeBuilderPrintArea.height}
                    onChange={(event) => {
                      updateBuilderSlot(activeBuilderSlotKey, (currentSlot) => ({
                        ...currentSlot,
                        printArea: normalizeArea({
                          ...currentSlot.printArea,
                          height: Number(event.target.value),
                        }),
                      }))
                    }}
                  />
                  <strong>
                    {builderPixelRect?.height ?? 0}px (
                    {formatPercent(activeBuilderPrintArea.height)})
                  </strong>
                </label>
              </div>
            ) : null}

            <div className="builder-actions">
              <button
                className="primary-action"
                type="button"
                onClick={handleSaveBuilder}
                disabled={isSavingBuilder}
              >
                {isSavingBuilder ? 'Saving views...' : 'Save configured views'}
              </button>
              <button className="secondary-action slim" type="button" onClick={() => resetBuilder()}>
                Clear builder
              </button>
            </div>

            {builderError ? <p className="status error">{builderError}</p> : null}
            {builderStatus ? <p className="status success">{builderStatus}</p> : null}
          </aside>

          <section className="panel builder-canvas-panel">
            <div className="panel-heading">
              <p className="section-tag">View Editor</p>
              <h2>Set the print area for each uploaded view</h2>
            </div>

            <div className="builder-tab-row">
              {VIEW_OPTIONS.map((option) => {
                const hasImage = Boolean(builderSlots[option.key]?.image)
                const isActive = option.key === activeBuilderSlotKey

                return (
                  <button
                    key={option.key}
                    type="button"
                    className={isActive ? 'builder-tab active' : 'builder-tab'}
                    onClick={() => setActiveBuilderSlotKey(option.key)}
                  >
                    <span>{option.shortLabel}</span>
                    <small>{hasImage ? 'Ready' : 'Optional'}</small>
                  </button>
                )
              })}
            </div>

            {activeBuilderImage ? (
              <>
                <div className="builder-stage">
                  <div ref={builderCanvasRef} className="builder-image-frame">
                    <img
                      className="builder-image"
                      src={activeBuilderImage.src}
                      alt={activeBuilderImage.name}
                    />

                    {builderCanvasReady ? (
                      <Rnd
                        className="builder-area"
                        bounds="parent"
                        size={{
                          width: builderCanvasSize.width * activeBuilderPrintArea.width,
                          height: builderCanvasSize.height * activeBuilderPrintArea.height,
                        }}
                        position={{
                          x: builderCanvasSize.width * activeBuilderPrintArea.x,
                          y: builderCanvasSize.height * activeBuilderPrintArea.y,
                        }}
                        minWidth={Math.max(48, builderCanvasSize.width * AREA_MIN_SIZE)}
                        minHeight={Math.max(48, builderCanvasSize.height * AREA_MIN_SIZE)}
                        onDragStop={(_event, data) => {
                          updateBuilderSlot(activeBuilderSlotKey, (currentSlot) => ({
                            ...currentSlot,
                            printArea: normalizeArea({
                              ...currentSlot.printArea,
                              x: data.x / builderCanvasSize.width,
                              y: data.y / builderCanvasSize.height,
                            }),
                          }))
                        }}
                        onResizeStop={(_event, _direction, ref, _delta, position) => {
                          updateBuilderSlot(activeBuilderSlotKey, (currentSlot) => ({
                            ...currentSlot,
                            printArea: normalizeArea({
                              x: position.x / builderCanvasSize.width,
                              y: position.y / builderCanvasSize.height,
                              width: ref.offsetWidth / builderCanvasSize.width,
                              height: ref.offsetHeight / builderCanvasSize.height,
                            }),
                          }))
                        }}
                      >
                        <div className="builder-area-label">Printable zone</div>
                      </Rnd>
                    ) : null}
                  </div>
                </div>

                <div className="builder-metrics">
                  <div>
                    <span>Active view</span>
                    <strong>{activeBuilderOption.title}</strong>
                  </div>
                  <div>
                    <span>Origin</span>
                    <strong>
                      {builderPixelRect?.x ?? 0}, {builderPixelRect?.y ?? 0}
                    </strong>
                  </div>
                  <div>
                    <span>Print area</span>
                    <strong>
                      {builderPixelRect?.width ?? 0} × {builderPixelRect?.height ?? 0}px
                    </strong>
                  </div>
                  <div>
                    <span>Configured</span>
                    <strong>{configuredBuilderOptions.length} / 4 views</strong>
                  </div>
                </div>
              </>
            ) : (
              <div className="preview-placeholder large">
                <p>Upload an image for {activeBuilderOption.title.toLowerCase()}.</p>
                <p>
                  You can add just one view now and come back later for the rest.
                </p>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}

export default App
