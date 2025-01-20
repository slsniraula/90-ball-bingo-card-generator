// Include jsPDF library
// <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>

import { jsPDF } from "jspdf";

function generateBingoCards() {
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
    });

    const totalCards = 100;
    // const cardsPerRow = 2; // Adjust two cards on one row
    const cardWidth = 80;
    const cardHeight = 50;
    const margin = 10;
    const pageWidth = 210; 
    const pageHeight = 297; 
    const cardsPerRow = Math.floor((pageWidth - margin * 2) / cardWidth);
    const cardsPerColumn = Math.floor((pageHeight - margin * 2) / cardHeight);
    const cardsPerPage = cardsPerRow * cardsPerColumn;

    // Function to generate a bingo card
    const generateCard = (id) => {
        const card = Array(9).fill(null).map(() => Array(3).fill(null));
        const columnRanges = [
            [1, 10], [11, 20], [21, 30], [31, 40], [41, 50],
            [51, 60], [61, 70], [71, 80], [81, 90],
        ];

        // Place 5 numbers in each row
        for (let row = 0; row < 3; row++) {
            const positions = new Set();
            while (positions.size < 5) {
                positions.add(Math.floor(Math.random() * 9));
            }

            positions.forEach((col) => {
                const [min, max] = columnRanges[col];
                let number;
                do {
                    number = Math.floor(Math.random() * (max - min + 1)) + min;
                } while (card[col].flat().includes(number));
                card[col][row] = number;
            });
        }

        return { id, card };
    };

    // Render a single bingo card
    const renderCard = (doc, cardObj, xOffset, yOffset) => {
        const cellWidth = cardWidth / 9;
        const cellHeight = cardHeight / 3;
        const { id, card } = cardObj;

        // Card title
        doc.setFontSize(10);
        doc.text(`Card ID: ${id}`, xOffset + 5, yOffset + 5);

        // Draw card grid and numbers
        for (let col = 0; col < 9; col++) {
            for (let row = 0; row < 3; row++) {
                const x = xOffset + col * cellWidth;
                const y = yOffset + row * cellHeight + 10;

                // Draw cell
                doc.rect(x, y, cellWidth, cellHeight);

                // Add number if exists
                const number = card[col][row];
                if (number) {
                    doc.text(`${number}`, x + cellWidth / 2 - 2, y + cellHeight / 2 + 2, {
                        align: "center",
                    });
                }
            }
        }
    };

    // Generate and render all cards
    for (let i = 0; i < totalCards; i++) {
        const card = generateCard(i + 1);
        const row = Math.floor(i / cardsPerRow) % 2;
        const col = i % cardsPerRow;

        const xOffset = margin + col * (cardWidth + margin);
        const yOffset = margin + row * (cardHeight + margin);

        renderCard(doc, card, xOffset, yOffset);

        // Add new page if necessary
        if (i % (cardsPerRow * 2) === cardsPerRow * 2 - 1 && i !== totalCards - 1) {
            doc.addPage();
        }
    }

    // Save the PDF
    doc.save("BingoCards.pdf");
}

// Generate the bingo cards
generateBingoCards();
