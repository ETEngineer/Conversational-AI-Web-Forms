import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import './Responses.css';
import { formApi, responseApi } from '../../services/api';

const Responses = () => {
    const { formId } = useParams();
    const [questions, setQuestions] = useState([]);
    const [responses, setResponses] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const formResponse = await formApi.getFormById(formId);
                const responsesResponse = await responseApi.getResponses(formId);

                const formsData = Array.isArray(formResponse?.questions) ? formResponse.questions : [];
                const responsesData = Array.isArray(responsesResponse?.data) ? responsesResponse.data : [];

                setQuestions(formsData);
                setResponses(responsesData);
                setIsLoading(false);
            } catch (error) {
                console.error('Error fetching data:', error);
                setError('Error fetching data');
                setIsLoading(false);
            }
        };

        fetchData();
    }, [formId]);

    if (error) {
        return <div>{error}</div>;
    }

    if (isLoading) {
        return <div>Loading...</div>;
    }

    return (
        <div>
            <h1>Form Responses</h1>
            <table className="responses-table">
                <thead>
                    <tr>
                        <th>S.No</th>
                        <th>Submitted At</th>
                        {questions.map((question) => (
                            <th key={question._id}>{question.question}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {responses.map((response, index) => (
                        <tr key={response._id}>
                            <td>{index + 1}</td>
                            <td>{new Date(response.submittedAt).toLocaleString()}</td>
                            {questions.map((question) => {
                                const answerObj = response.answers.find(
                                    (a) => a.questionId === question._id
                                );
                                const answer = answerObj ? answerObj.answer : 'N/A';
                                return <td key={question._id}>{answer}</td>;
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default Responses;