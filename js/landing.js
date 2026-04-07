document.addEventListener('DOMContentLoaded', () => {
    const track = document.getElementById('carousel-track');
    const dots = document.querySelectorAll('.carousel-dot');
    const slides = document.querySelectorAll('.carousel-slide'); // 5 slides now [3-Clone, 1, 2, 3, 1-Clone]
    const intervalTime = 10000; // 10 seconds
    let activeIndex = 1; // Start at Slide 1 (Index 1)
    let slideInterval;
    let isTransitioning = false;

    // Drag State
    let isDown = false;
    let startX;
    let currentTranslate = 0;
    let prevTranslate = 0;
    let animationID;

    // Initial Position handled via HTML style, but activeIndex=1 tracks it.

    const getSlideWidth = () => track.parentElement.clientWidth;

    const updateCarousel = (transition = true) => {
        if (transition) {
            track.style.transition = 'transform 1.5s ease-out';
        } else {
            track.style.transition = 'none';
        }
        const width = getSlideWidth();
        track.style.transform = `translateX(-${activeIndex * width}px)`;

        // Update dots based on DATA-ID
        const realIndex = parseInt(slides[activeIndex].getAttribute('data-id')) - 1;

        dots.forEach((dot, i) => {
            if (i === realIndex) {
                dot.classList.remove('bg-slate-300', 'dark:bg-slate-700', 'hover:bg-slate-400', 'dark:hover:bg-slate-600');
                dot.classList.add('bg-primary');
            } else {
                dot.classList.remove('bg-primary');
                dot.classList.add('bg-slate-300', 'dark:bg-slate-700', 'hover:bg-slate-400', 'dark:hover:bg-slate-600');
            }
        });
    };

    const handleTransitionEnd = () => {
        isTransitioning = false;
        if (activeIndex === 0) {
            track.style.transition = 'none';
            activeIndex = slides.length - 2; // Jump to Slide 3 (Index 3)
            track.style.transform = `translateX(-${activeIndex * getSlideWidth()}px)`;
        } else if (activeIndex === slides.length - 1) {
            track.style.transition = 'none';
            activeIndex = 1; // Jump to Slide 1 (Index 1)
            track.style.transform = `translateX(-${activeIndex * getSlideWidth()}px)`;
        }
    };

    track.addEventListener('transitionend', handleTransitionEnd);

    const nextSlide = () => {
        if (isTransitioning) return;
        isTransitioning = true;
        activeIndex++;
        updateCarousel(true);
    };

    const prevSlide = () => {
        if (isTransitioning) return;
        isTransitioning = true;
        activeIndex--;
        updateCarousel(true);
    };

    const startInterval = () => {
        clearInterval(slideInterval);
        slideInterval = setInterval(nextSlide, intervalTime);
    };

    // ---- Drag/Swipe Logic ----

    const getPositionX = (event) => {
        return event.type.includes('mouse') ? event.pageX : event.touches[0].clientX;
    };

    const dragStart = (e) => {
        if (isTransitioning) return;
        isDown = true;
        track.classList.add('active');
        track.style.cursor = 'grabbing';
        track.style.transition = 'none';

        startX = getPositionX(e);
        currentTranslate = -(activeIndex * getSlideWidth());
        prevTranslate = currentTranslate;

        clearInterval(slideInterval);
    };

    const dragEnd = () => {
        if (!isDown) return;
        isDown = false;
        track.style.cursor = 'grab';

        const movedBy = currentTranslate - prevTranslate;
        const threshold = getSlideWidth() * 0.2; // 20%

        if (movedBy < -threshold) {
            activeIndex++;
        } else if (movedBy > threshold) {
            activeIndex--;
        }

        isTransitioning = true;
        updateCarousel(true);
        startInterval();
    };

    const dragMove = (e) => {
        if (!isDown) return;
        e.preventDefault();
        const currentPosition = getPositionX(e);
        const diff = currentPosition - startX;
        currentTranslate = prevTranslate + diff;
        track.style.transform = `translateX(${currentTranslate}px)`;
    };

    // Event Listeners
    track.addEventListener('mousedown', dragStart);
    track.addEventListener('touchstart', dragStart, { passive: false });

    track.addEventListener('mouseleave', () => {
        if (isDown) dragEnd();
    });
    track.addEventListener('mouseup', dragEnd);
    track.addEventListener('touchend', dragEnd);

    track.addEventListener('mousemove', dragMove);
    track.addEventListener('touchmove', dragMove, { passive: false });

    // Dots
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            clearInterval(slideInterval);
            activeIndex = index + 1; // +1 because index 0 is clone
            updateCarousel(true);
            startInterval();
        });
    });

    // Resize handler
    window.addEventListener('resize', () => {
        track.style.transition = 'none';
        const width = getSlideWidth();
        track.style.transform = `translateX(-${activeIndex * width}px)`;
    });

    // Initial Start
    startInterval();

    // Force layout update for correct width calc on load
    setTimeout(() => {
        track.style.transition = 'none';
        track.style.transform = `translateX(-${activeIndex * getSlideWidth()}px)`;
    }, 50);

    // FAQ Scroll Logic
    const faqContainer = document.getElementById('faq-container');
    let isFaqDown = false;
    let startY;
    let scrollTop;

    faqContainer.addEventListener('mousedown', (e) => {
        isFaqDown = true;
        faqContainer.classList.add('active');
        faqContainer.style.cursor = 'grabbing';
        startY = e.pageY - faqContainer.offsetTop;
        scrollTop = faqContainer.scrollTop;
    });

    faqContainer.addEventListener('mouseleave', () => {
        isFaqDown = false;
        faqContainer.style.cursor = 'grab';
    });

    faqContainer.addEventListener('mouseup', () => {
        isFaqDown = false;
        faqContainer.style.cursor = 'grab';
    });

    faqContainer.addEventListener('mousemove', (e) => {
        if (!isFaqDown) return;
        e.preventDefault();
        const y = e.pageY - faqContainer.offsetTop;
        const walk = (y - startY) * 1.5; // Scroll speed multiplier
        faqContainer.scrollTop = scrollTop - walk;
    });
});
